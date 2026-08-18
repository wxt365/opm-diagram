package org.opm.localruntime;

import org.opm.localruntime.releaseauthoring.GoldenFixtureMaterializationException;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootApplication
public class LocalRuntimeApplication {

    public static void main(String[] args) {
        try {
            ConfigurableApplicationContext context = SpringApplication.run(LocalRuntimeApplication.class, args);
            if (context.getEnvironment().matchesProfiles("release-golden-authoring")) {
                System.exit(SpringApplication.exit(context));
            }
        } catch (RuntimeException exception) {
            GoldenFixtureMaterializationException materialization = materializationFailure(exception);
            if (materialization == null) throw exception;
            System.err.println(materialization.code());
            System.exit(GoldenFixtureMaterializationException.exitCodeFor(materialization.code()));
        }
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
