package org.opm.localruntime.releaseauthoring;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GoldenFixtureMaterializationExceptionTest {

    @Test
    void mapsCommonUiSetupFailureToOperationalExitCode() {
        assertEquals(3, GoldenFixtureMaterializationException.exitCodeFor("GOLDEN_COMMON_UI_SETUP_FAILED"));
    }

    @Test
    void keepsCommonInputAndInternalFailuresSeparated() {
        assertEquals(2, GoldenFixtureMaterializationException.exitCodeFor("GOLDEN_COMMON_MODE_REJECTED"));
        assertEquals(4, GoldenFixtureMaterializationException.exitCodeFor("GOLDEN_COMMON_INTERNAL_ERROR"));
    }
}
