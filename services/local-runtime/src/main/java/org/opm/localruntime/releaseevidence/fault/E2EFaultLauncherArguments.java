package org.opm.localruntime.releaseevidence.fault;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** 原始命令行的 fail-closed 解析器；不保存跨启动状态。 */
public record E2EFaultLauncherArguments(Map<String, String> values) {

    public static final String PROFILE = "spring.profiles.active";
    public static final String ENABLED = "opm.release.e2e.enabled";
    public static final String GUARD = "opm.release.e2e.guard";
    public static final String PLAN = "opm.release.e2e.plan";
    public static final String PLAN_RAW_SHA256 = "opm.release.e2e.plan-raw-sha256";
    public static final String CASE_ID = "opm.release.e2e.case-id";
    public static final String ATTEMPT_ORDINAL = "opm.release.e2e.attempt-ordinal";
    public static final String PARENT_NONCE = "opm.release.e2e.parent-nonce";
    public static final String CHALLENGE = "opm.release.e2e.challenge";
    public static final String CHALLENGE_RESPONSE = "opm.release.e2e.challenge-response";
    public static final Set<String> FAULT_KEYS = Set.of(ENABLED, GUARD, PLAN, PLAN_RAW_SHA256, CASE_ID,
            ATTEMPT_ORDINAL, PARENT_NONCE, CHALLENGE, CHALLENGE_RESPONSE);

    public E2EFaultLauncherArguments { values = Map.copyOf(values); }

    public static Optional<E2EFaultLauncherArguments> scanRaw(String[] arguments) {
        Map<String, String> found = new LinkedHashMap<>();
        boolean seenFaultSyntax = false;
        for (String argument : arguments) {
            if (!argument.startsWith("--")) continue;
            int split = argument.indexOf('=');
            String key = split < 0 ? argument.substring(2) : argument.substring(2, split);
            if (key.startsWith("opm.release.e2e.")) {
                seenFaultSyntax = true;
                if (!FAULT_KEYS.contains(key)) throw invalid("ARGS_SOURCE", null, null, "Unknown fault option");
            }
            if (!FAULT_KEYS.contains(key) && !PROFILE.equals(key)) continue;
            if (split < 3 || found.putIfAbsent(key, argument.substring(split + 1)) != null) {
                throw invalid("ARGS_SOURCE", null, null, "Duplicate or malformed fault option");
            }
        }
        boolean profileFault = "release-e2e-fault".equals(found.get(PROFILE));
        boolean profileMentionsFault = found.getOrDefault(PROFILE, "").contains("release-e2e-fault");
        boolean configured = seenFaultSyntax || profileMentionsFault;
        if (!configured) return Optional.empty();
        if (!profileFault || found.size() != FAULT_KEYS.size() + 1 || !found.keySet().containsAll(FAULT_KEYS)) {
            throw invalid("MODE_AND_PROFILE", found.get(CASE_ID), ordinal(found), "Fault tuple is incomplete");
        }
        return Optional.of(new E2EFaultLauncherArguments(found));
    }

    public static E2EFaultLauncherException invalid(String stage, String caseId, Integer ordinal, String message) {
        return new E2EFaultLauncherException(E2EFaultLauncherErrorCode.E2E_FAULT_CONFIGURATION_INVALID, stage, caseId, ordinal, message);
    }

    private static Integer ordinal(Map<String, String> values) {
        try { return values.containsKey(ATTEMPT_ORDINAL) ? Integer.valueOf(values.get(ATTEMPT_ORDINAL)) : null; }
        catch (NumberFormatException exception) { return null; }
    }
}
