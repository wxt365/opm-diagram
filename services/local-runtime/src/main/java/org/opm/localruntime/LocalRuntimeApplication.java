package org.opm.localruntime;

import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.opm.localruntime.releaseauthoring.ReleaseGoldenAuthoringLaunchMode;
import org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherArguments;
import org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherException;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootApplication
public class LocalRuntimeApplication {

    public static void main(String[] args) {
        try {
            E2EFaultLauncherArguments.scanRaw(args);
            ConfigurableApplicationContext context = SpringApplication.run(LocalRuntimeApplication.class, args);
            if (ReleaseGoldenAuthoringLaunchMode.isFiniteReleaseInvocation(context.getEnvironment())) {
                System.exit(SpringApplication.exit(context));
            }
        } catch (RuntimeException exception) {
            E2EFaultLauncherException fault = faultFailure(exception);
            if (fault != null) {
                fault.reportOnce();
                System.exit(fault.exitCode());
                return;
            }
            GoldenFixtureMaterializationException materialization = materializationFailure(exception);
            if (materialization == null) throw exception;
            System.err.println(materialization.code());
            System.exit(GoldenFixtureMaterializationException.exitCodeFor(materialization.code()));
        }
    }

    private static E2EFaultLauncherException faultFailure(Throwable exception) {
        java.util.Set<Throwable> seen = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        Throwable current = exception;
        while (current != null && seen.add(current)) {
            if (current instanceof E2EFaultLauncherException fault) return fault;
            current = current.getCause();
        }
        return null;
    }

    private static GoldenFixtureMaterializationException materializationFailure(Throwable exception) {
        Throwable current = exception;
        while (current != null) {
            if (current instanceof GoldenFixtureMaterializationException materialization) return materialization;
            current = current.getCause();
        }
        return null;
    }
}
