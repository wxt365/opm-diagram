package org.opm.localruntime.application;

import org.opm.localruntime.semantic.SemanticRevision;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static org.opm.localruntime.application.SemanticViewSupport.*;
import static org.opm.localruntime.application.SemanticEditValues.*;

/** 布局及 State 容器约束；仅修改调用方提供的候选集合。 */
final class SemanticLayoutEditor {
    private SemanticLayoutEditor() { }

    static void updateOccurrenceLayout(
            SemanticRevision base,
            Map<String, Object> payload,
            List<SemanticRevision.Element> elements,
            List<SemanticRevision.Feature> features,
            List<SemanticRevision.Occurrence> occurrences,
            List<SemanticRevision.Layout> layouts) {
        if (!payload.keySet().equals(java.util.Set.of("occurrence_id", "layout"))) {
            throw domain("UPDATE_LAYOUT 只允许 occurrence_id 和 layout");
        }
        String occurrenceId = required(payload, "occurrence_id");
        Map<String, Object> requestedLayout = requiredMap(payload, "layout");
        if (!requestedLayout.keySet().equals(java.util.Set.of("x", "y"))) {
            throw domain("UPDATE_LAYOUT 的 layout 只允许 x 和 y");
        }
        double x = requiredFiniteNumber(requestedLayout, "x");
        double y = requiredFiniteNumber(requestedLayout, "y");
        SemanticRevision.Occurrence occurrence = occurrences.stream()
                .filter(item -> item.id().equals(occurrenceId))
                .findFirst()
                .orElseThrow(() -> domain("Occurrence 不存在"));
        if (base.contexts().stream().noneMatch(item -> item.id().equals(occurrence.contextId()))
                || occurrence.ownership() != SemanticRevision.OccurrenceOwnership.OWNED) {
            throw domain("该 Occurrence 不支持普通布局编辑");
        }

        if (occurrence.targetKind() == SemanticRevision.TargetKind.ELEMENT) {
            SemanticRevision.Element element = elements.stream()
                    .filter(item -> item.id().equals(occurrence.targetId()))
                    .findFirst()
                    .orElseThrow(() -> domain("Occurrence Element 不存在"));
            boolean object = "OBJECT_NODE".equals(occurrence.constructRole()) && element.coreKind() == SemanticRevision.CoreKind.OBJECT;
            boolean process = "PROCESS_NODE".equals(occurrence.constructRole()) && element.coreKind() == SemanticRevision.CoreKind.PROCESS;
            if (!object && !process) throw domain("该 Element Occurrence 不支持普通布局编辑");
        } else if (occurrence.targetKind() == SemanticRevision.TargetKind.FEATURE) {
            SemanticRevision.Feature feature = features.stream()
                    .filter(item -> item.id().equals(occurrence.targetId()))
                    .findFirst()
                    .orElseThrow(() -> domain("Occurrence Feature 不存在"));
            boolean attribute = "ATTRIBUTE_NODE".equals(occurrence.constructRole()) && feature.kind() == SemanticRevision.FeatureKind.ATTRIBUTE;
            boolean operation = "OPERATION_NODE".equals(occurrence.constructRole()) && feature.kind() == SemanticRevision.FeatureKind.OPERATION;
            if (!attribute && !operation) {
                throw domain("该 Feature Occurrence 不支持普通布局编辑");
            }
        } else if (occurrence.targetKind() == SemanticRevision.TargetKind.STATE) {
            var state = base.states().stream().filter(item -> item.id().equals(occurrence.targetId())).findFirst().orElseThrow(() -> domain("State 不存在"));
            String role = state.ownerTargetKind() == SemanticRevision.TargetKind.FEATURE ? "FEATURE_STATE_NODE" : "STATE_NODE";
            if (!role.equals(occurrence.constructRole())) throw domain("State role 与 owner 不匹配");
            stateOwner(state, occurrence, occurrences);
        } else {
            throw domain("该 Occurrence 不支持普通布局编辑");
        }
        var current = occurrenceLayout(occurrence, layouts);
        replaceLayout(layouts, new SemanticRevision.Layout(current.id(), x, y, current.width(), current.height(), current.zOrder()));
        if (occurrence.targetKind() == SemanticRevision.TargetKind.STATE) {
            var state = base.states().stream().filter(item -> item.id().equals(occurrence.targetId())).findFirst().orElseThrow();
            containState(state, occurrence, occurrences, layouts, false);
            compactStateOwner(state, occurrence, base.states(), occurrences, layouts);
        } else {
            double dx = x - current.x(), dy = y - current.y();
            for (var state : base.states()) {
                if (state.ownerTargetKind() != occurrence.targetKind() || !state.ownerElementId().equals(occurrence.targetId())) continue;
                for (var child : occurrences) {
                    if (child.targetKind() != SemanticRevision.TargetKind.STATE || !child.targetId().equals(state.id())
                            || !child.contextId().equals(occurrence.contextId()) || child.ownership() != SemanticRevision.OccurrenceOwnership.OWNED) continue;
                    var position = occurrenceLayout(child, layouts);
                    replaceLayout(layouts, new SemanticRevision.Layout(position.id(), position.x() + dx, position.y() + dy, position.width(), position.height(), position.zOrder()));
                    containState(state, child, occurrences, layouts, true);
                }
            }
        }
    }

    /** 批量绝对几何快照；由上层先验证完整授权，候选验证完成后才写入 journal。 */
    static void updateBatch(SemanticRevision base, Map<String, Object> payload, List<SemanticRevision.Layout> layouts) {
        var ids = new java.util.HashSet<String>();
        for (Object entry : (List<?>) payload.get("layouts")) {
            var item = map(entry); String id = required(item, "occurrence_id");
            if (!ids.add(id)) throw domain("批量布局目标重复");
            var occurrence = base.occurrences().stream().filter(value -> value.id().equals(id)).findFirst().orElseThrow(() -> domain("Occurrence 不存在"));
            var previous = occurrenceLayout(occurrence, layouts); var geometry = requiredMap(item, "layout");
            double width = requiredFiniteNumber(geometry, "width"), height = requiredFiniteNumber(geometry, "height");
            if (width <= 0 || height <= 0) throw domain("布局尺寸必须为正数");
            replaceLayout(layouts, new SemanticRevision.Layout(previous.id(), requiredFiniteNumber(geometry, "x"),
                    requiredFiniteNumber(geometry, "y"), width, height, previous.zOrder()));
        }
        // 快照已包含父状态联动，不能再隐式加偏移；校验最终容纳关系。只检查受影响的容器。
        for (var state : base.states()) for (var child : base.occurrences()) {
            if (child.targetKind() != SemanticRevision.TargetKind.STATE || !child.targetId().equals(state.id())
                    || child.ownership() != SemanticRevision.OccurrenceOwnership.OWNED) continue;
            var owner = stateOwner(state, child, base.occurrences());
            if (!ids.contains(child.id()) && !ids.contains(owner.id())) continue;
            var box = occurrenceLayout(owner, layouts); var position = occurrenceLayout(child, layouts);
            double tolerance = 1e-7;
            if (position.x() < box.x() + 8 - tolerance || position.y() < box.y() + 28 - tolerance
                    || position.x() + position.width() > box.x() + box.width() - 8 + tolerance
                    || position.y() + position.height() > box.y() + box.height() - 8 + tolerance)
                throw domain("状态布局必须位于所属节点内容区");
        }
    }

    static SemanticRevision.Occurrence stateOwner(SemanticRevision.State state, SemanticRevision.Occurrence child, List<SemanticRevision.Occurrence> occurrences) {
        var owners = occurrences.stream().filter(item -> item.contextId().equals(child.contextId())
                && item.targetKind() == state.ownerTargetKind() && item.targetId().equals(state.ownerElementId())
                && item.ownership() == SemanticRevision.OccurrenceOwnership.OWNED
                && (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT ? "OBJECT_NODE".equals(item.constructRole())
                : java.util.Set.of("ATTRIBUTE_NODE", "OPERATION_NODE").contains(item.constructRole()))).toList();
        if (owners.size() != 1) throw domain("State 必须有唯一的同 Context owned owner");
        return owners.getFirst();
    }

    static SemanticRevision.Layout occurrenceLayout(SemanticRevision.Occurrence occurrence, List<SemanticRevision.Layout> layouts) {
        return layouts.stream().filter(item -> item.id().equals(occurrence.layoutId())).findFirst().orElseThrow(() -> domain("Occurrence Layout 不存在"));
    }

    static void replaceLayout(List<SemanticRevision.Layout> layouts, SemanticRevision.Layout value) {
        if (!Double.isFinite(value.x()) || !Double.isFinite(value.y()) || !Double.isFinite(value.width()) || !Double.isFinite(value.height())) throw domain("布局计算溢出");
        for (int i = 0; i < layouts.size(); i++) if (layouts.get(i).id().equals(value.id())) { layouts.set(i, value); return; }
        throw domain("Occurrence Layout 不存在");
    }

    /** 状态收回内容区后释放多余空间；只计算同 Context 的 owned 状态，不改任何状态坐标。 */
    static void compactStateOwner(SemanticRevision.State state, SemanticRevision.Occurrence child,
                                  List<SemanticRevision.State> states, List<SemanticRevision.Occurrence> occurrences,
                                  List<SemanticRevision.Layout> layouts) {
        var owner = stateOwner(state, child, occurrences);
        var bounds = occurrenceLayout(owner, layouts);
        var stateIds = states.stream().filter(item -> item.ownerTargetKind() == state.ownerTargetKind()
                && item.ownerElementId().equals(state.ownerElementId())).map(SemanticRevision.State::id).collect(java.util.stream.Collectors.toSet());
        double width = 160, height = 72;
        for (var occurrence : occurrences) {
            if (occurrence.targetKind() != SemanticRevision.TargetKind.STATE || !stateIds.contains(occurrence.targetId())
                    || !occurrence.contextId().equals(owner.contextId()) || occurrence.ownership() != SemanticRevision.OccurrenceOwnership.OWNED) continue;
            var position = occurrenceLayout(occurrence, layouts);
            width = Math.max(width, position.x() + position.width() + 8 - bounds.x());
            height = Math.max(height, position.y() + position.height() + 8 - bounds.y());
        }
        replaceLayout(layouts, new SemanticRevision.Layout(bounds.id(), bounds.x(), bounds.y(), width, height, bounds.zOrder()));
    }

    /** 状态保持在所属节点的内容区；创建与父移动可以扩大容器，单独拖动只夹取位置。 */
    static void containState(SemanticRevision.State state, SemanticRevision.Occurrence child, List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts, boolean expand) {
        var owner = stateOwner(state, child, occurrences);
        var box = occurrenceLayout(owner, layouts); var position = occurrenceLayout(child, layouts);
        double width = Math.max(box.width(), position.width() + 16), height = Math.max(box.height(), position.height() + 36);
        double x = Math.max(box.x() + 8, position.x()), y = Math.max(box.y() + 28, position.y());
        if (expand) { width = Math.max(width, x - box.x() + position.width() + 8); height = Math.max(height, y - box.y() + position.height() + 8); }
        x = Math.min(x, box.x() + width - position.width() - 8);
        y = Math.min(y, box.y() + height - position.height() - 8);
        replaceLayout(layouts, new SemanticRevision.Layout(box.id(), box.x(), box.y(), width, height, box.zOrder()));
        replaceLayout(layouts, new SemanticRevision.Layout(position.id(), x, y, position.width(), position.height(), position.zOrder()));
    }

    static void appendOccurrence(SemanticRevision base, String targetId, SemanticRevision.TargetKind targetKind, String role, Map<String, Object> payload,
                                  List<SemanticRevision.Context> contexts, List<SemanticRevision.Occurrence> occurrences, List<SemanticRevision.Layout> layouts) {
        String occurrenceId = newId("occurrence"); String layoutId = newId("layout"); Map<String, Object> layout = map(payload.get("layout"));
        double x = decimal(layout.get("x"), 80); double y = decimal(layout.get("y"), 80); double width = decimal(layout.get("width"), targetKind == SemanticRevision.TargetKind.STATE ? 88 : 160); double height = decimal(layout.get("height"), targetKind == SemanticRevision.TargetKind.FACT ? 2 : targetKind == SemanticRevision.TargetKind.STATE ? 28 : 72);
        String contextId = optional(payload, "context_id");
        if (contextId == null) contextId = base.rootContextId();
        String ownerContext = contextId;
        if (contexts.stream().noneMatch(item -> item.id().equals(ownerContext))) throw domain("目标 Context 不存在");
        occurrences.add(new SemanticRevision.Occurrence(occurrenceId, contextId, targetKind, targetId, SemanticRevision.OccurrenceOwnership.OWNED, role, layoutId));
        layouts.add(new SemanticRevision.Layout(layoutId, x, y, width, height, layouts.size() + 1));
        for (int index = 0; index < contexts.size(); index++) {
            SemanticRevision.Context context = contexts.get(index);
            if (context.id().equals(ownerContext)) contexts.set(index, new SemanticRevision.Context(context.id(), context.kind(), context.capability(), context.name(), append(context.occurrenceIds(), occurrenceId), context.source(), context.architectureLevel(), context.architectureLinks()));
        }
    }

}
