package org.opm.localruntime.releaseevidence.fault;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.StandardEnvironment;

import static org.junit.jupiter.api.Assertions.assertSame;

class E2EFaultLauncherConfigurationTest {
    @Test
    void normalEnvironmentReceivesOnlyNoopPort() {
        assertSame(E2EFaultPort.NOOP, new E2EFaultLauncherConfiguration().e2eFaultPort(new StandardEnvironment()));
    }
}
