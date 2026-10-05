package org.opm.localruntime.semantic;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

/** 只构造查询视图，禁止用该 DTO 覆盖完整持久文档。 */
public final class DraftSemanticView {
    private DraftSemanticView() { }
    public static SemanticRevision read(ObjectNode source) {
        return read(source, source.path("revision_id").asText(), exactInteger(source, "revision_sequence"));
    }
    public static SemanticRevision read(ObjectNode source, String revision, int sequence) {
        ObjectNode view = source.deepCopy(); view.put("revision_id", revision).put("revision_sequence", sequence);
        for (var layout : view.required("layouts")) ((ObjectNode) layout).put("z_order", exactInteger((ObjectNode) layout, "z_order"));
        for (var fact : view.required("facts")) for (var endpoint : fact.required("endpoints"))
            ((ObjectNode) endpoint).put("ordinal", exactInteger((ObjectNode) endpoint, "ordinal"));
        return new SemanticRevisionReader().read(new ByteArrayInputStream(view.toString().getBytes(StandardCharsets.UTF_8)));
    }
    private static int exactInteger(ObjectNode node, String field) {
        var raw = node.required(field); double value = raw.doubleValue();
        if (!raw.isNumber() || value < Integer.MIN_VALUE || value > Integer.MAX_VALUE || Math.rint(value) != value)
            throw new IllegalArgumentException("语义整数字段无效：" + field);
        return (int) value;
    }
}
