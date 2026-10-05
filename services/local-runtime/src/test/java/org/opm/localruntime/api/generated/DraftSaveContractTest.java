package org.opm.localruntime.api.generated;

import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

class DraftSaveContractTest {
    private static final String TOKEN = "{\"draft_id\":\"draft.1\",\"edit_seq\":0,\"binding_digest\":\"" + "a".repeat(64) + "\"}";
    private static final String REQUEST = "{\"save_id\":\"save.1\",\"target_draft_token\":" + TOKEN + ",\"reason\":\"MANUAL\"}";

    @Test
    void readsAndRoundTripsExactManualSave() throws Exception {
        var value = DraftSaveContract.read(REQUEST, DraftSaveContract.SaveRequest.class);
        assertEquals(0L, value.target_draft_token().edit_seq());
        assertEquals("MANUAL", value.reason());
        var mapper = new ObjectMapper();
        assertEquals(mapper.readTree(REQUEST), mapper.readTree(mapper.writeValueAsString(value)));
        assertEquals(9007199254740991L, DraftSaveContract.read(TOKEN.replace("\"edit_seq\":0", "\"edit_seq\":9007199254740991"), DraftSaveContract.DraftToken.class).edit_seq());
    }

    @Test
    void rejectsMissingUnknownDuplicateCoercedOrInvalidFields() {
        for (String invalid : new String[]{
                "null", REQUEST + " {}",
                REQUEST.replace("MANUAL", "AUTO"), REQUEST.replace("\"save_id\":\"save.1\",", ""),
                REQUEST.replace("\"edit_seq\":0,", ""), REQUEST.replace("\"edit_seq\":0", "\"edit_seq\":null"),
                REQUEST.replace("\"edit_seq\":0", "\"edit_seq\":-1"), REQUEST.replace("\"edit_seq\":0", "\"edit_seq\":0.5"),
                REQUEST.replace("\"edit_seq\":0", "\"edit_seq\":\"0\""),
                REQUEST.replace("\"edit_seq\":0", "\"edit_seq\":9007199254740992"),
                REQUEST.replace("\"edit_seq\":0", "\"edit_seq\":0,\"edit_seq\":1"),
                REQUEST.replace("\"reason\":", "\"unknown\":true,\"reason\":"),
                REQUEST.replace("\"draft_id\":", "\"extra\":false,\"draft_id\":")}) {
            assertThrows(JsonProcessingException.class, () -> DraftSaveContract.read(invalid, DraftSaveContract.SaveRequest.class), invalid);
        }
    }

    @Test
    void requiresNullableKeysButAcceptsExplicitNull() throws Exception {
        String state = "{\"durable_token\":" + TOKEN + ",\"checkpoint_token\":null,\"last_manual_revision\":null,"
                + "\"dirty_since\":null,\"deadline\":null,\"in_flight\":\"NONE\",\"pending_manual_target\":null,\"last_error\":null}";
        assertNull(DraftSaveContract.read(state, DraftSaveContract.SaveState.class).checkpoint_token());
        assertThrows(JsonProcessingException.class, () -> DraftSaveContract.read(state.replace("\"checkpoint_token\":null,", ""), DraftSaveContract.SaveState.class));
        for (String invalid : new String[]{"2026-02-30T00:00:00.000Z", "2026-09-11T00:00:00Z"}) {
            assertThrows(JsonProcessingException.class, () -> DraftSaveContract.read(state.replace("\"dirty_since\":null", "\"dirty_since\":\"" + invalid + "\""), DraftSaveContract.SaveState.class));
        }
    }
}
