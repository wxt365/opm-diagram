package org.opm.localruntime.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DraftJsonDeltaTest {
    @Test
    void reversesFineGrainedObjectsArraysMissingNullAndNegativeZero() {
        JsonNode before = DraftJsonDelta.read("{\"name\":\"订单😀\",\"a\":[{\"x\":-0,\"y\":1},2,3],\"nullable\":null,\"kept\":{\"description\":\"保留\"}}");
        JsonNode after = DraftJsonDelta.read("{\"name\":\"新订单\",\"a\":[{\"x\":0,\"y\":2}],\"new\":null,\"kept\":{\"description\":\"保留\"}}");
        var delta = DraftJsonDelta.between(before, after); String original = before.toString();
        assertEquals(DraftJsonDelta.digest(after), DraftJsonDelta.digest(DraftJsonDelta.apply(before, delta)));
        assertEquals(DraftJsonDelta.digest(before), DraftJsonDelta.digest(DraftJsonDelta.apply(after, DraftJsonDelta.reverse(delta))));
        assertEquals(original, before.toString());
        assertTrue(delta.toString().contains("\"path\":[\"a\",\"0\",\"x\"]"));
        assertFalse(delta.toString().contains("description"));
        assertEquals(0, DraftJsonDelta.between(before, before).get("operations").size());
    }

    @Test
    void corruptedDigestOrLateSlotNeverPartiallyChangesInput() {
        var before = DraftJsonDelta.read("{\"x\":1,\"y\":2}"); var after = DraftJsonDelta.read("{\"x\":2,\"y\":3}");
        var delta = DraftJsonDelta.between(before, after);
        for (String field : new String[]{"before_digest", "after_digest"}) {
            var broken = delta.deepCopy(); broken.put(field, "a".repeat(64));
            assertThrows(IllegalArgumentException.class, () -> DraftJsonDelta.apply(before, broken));
        }
        ((ObjectNode) delta.at("/operations/1/before")).put("value", 999);
        assertThrows(IllegalArgumentException.class, () -> DraftJsonDelta.apply(before, delta));
        assertEquals(1, before.get("x").intValue()); assertEquals(2, before.get("y").intValue());
    }

    @Test
    void strictJsonAndTypedDigestCannotCollideWithNumberLookalikes() {
        for (String raw : new String[]{"{\"x\":1,\"x\":2}", "{} {}", "{\"x\":1e400}", "{\"x\":\"\\ud800\"}"})
            assertThrows(IllegalArgumentException.class, () -> DraftJsonDelta.read(raw));
        assertNotEquals(DraftJsonDelta.digest(DraftJsonDelta.read("{\"x\":1}")), DraftJsonDelta.digest(DraftJsonDelta.read("{\"x\":[\"binary64\",\"3ff0000000000000\"]}")));
        assertNotEquals(DraftJsonDelta.digest(DraftJsonDelta.read("{\"x\":-0}")), DraftJsonDelta.digest(DraftJsonDelta.read("{\"x\":0}")));
        var delta = DraftJsonDelta.between(DraftJsonDelta.read("{}"), DraftJsonDelta.read("{\"x\":null}"));
        delta.put("schema_version", 1);
        assertThrows(IllegalArgumentException.class, () -> DraftJsonDelta.reverse(delta));
    }
}
