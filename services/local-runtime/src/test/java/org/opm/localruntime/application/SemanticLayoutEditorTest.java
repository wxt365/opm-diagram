package org.opm.localruntime.application;

import org.junit.jupiter.api.Test;
import org.opm.localruntime.semantic.SemanticRevision;
import java.util.ArrayList;
import java.util.List;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.opm.localruntime.semantic.SemanticRevision.*;

class SemanticLayoutEditorTest {
    @Test
    void compactsContainerWithoutChangingStatePositionsOrIgnoringOtherOwnedStates() {
        var first = state("state.first", "element.owner", TargetKind.ELEMENT);
        var second = state("state.second", "element.owner", TargetKind.ELEMENT);
        var occurrences = List.of(occurrence("element.owner", "context.root", TargetKind.ELEMENT, "OBJECT_NODE"),
                occurrence(first.id(), "context.root", TargetKind.STATE, "STATE_NODE"),
                occurrence(second.id(), "context.root", TargetKind.STATE, "STATE_NODE"),
                occurrence(first.id(), "context.other", TargetKind.STATE, "STATE_NODE"));
        var layouts = new ArrayList<>(List.of(layout(occurrences.get(0), 100, 100, 900, 246),
                layout(occurrences.get(1), 108, 128, 88, 28), layout(occurrences.get(2), 108, 164, 88, 28),
                layout(occurrences.get(3), 900, 900, 88, 28)));
        var statesBefore = List.copyOf(layouts.subList(1, layouts.size()));
        SemanticLayoutEditor.compactStateOwner(first, occurrences.get(1), List.of(first, second), occurrences, layouts);
        assertEquals(160, layouts.getFirst().width());
        assertEquals(100, layouts.getFirst().height());
        assertEquals(statesBefore, layouts.subList(1, layouts.size()));
    }

    @Test
    void preservesSpaceNeededByWideStateAndFeatureOwner() {
        var state = state("state.value", "feature.owner", TargetKind.FEATURE);
        var owner = occurrence("feature.owner", "context.root", TargetKind.FEATURE, "ATTRIBUTE_NODE");
        var child = occurrence(state.id(), "context.root", TargetKind.STATE, "FEATURE_STATE_NODE");
        var layouts = new ArrayList<>(List.of(layout(owner, 100, 100, 600, 200), layout(child, 108, 128, 240, 28)));
        SemanticLayoutEditor.compactStateOwner(state, child, List.of(state), List.of(owner, child), layouts);
        assertEquals(256, layouts.getFirst().width());
        assertEquals(72, layouts.getFirst().height());
    }

    private State state(String id, String owner, TargetKind kind) {
        return new State(id, kind, owner, new CapabilityReference("CAP-STATE-001", "profile.test", "0.1"),
                new QualifiedName("urn:test", id), List.of(), new SourceProvenance("profile.test", "0.1", "State", "source.test"),
                new Normalization(NormalizationLevel.CORE));
    }

    private Occurrence occurrence(String target, String context, TargetKind kind, String role) {
        return new Occurrence("occurrence." + target + "." + context, context, kind, target, OccurrenceOwnership.OWNED, role,
                "layout." + target + "." + context);
    }

    private SemanticRevision.Layout layout(Occurrence occurrence, double x, double y, double width, double height) {
        return new SemanticRevision.Layout(occurrence.layoutId(), x, y, width, height, 1);
    }
}
