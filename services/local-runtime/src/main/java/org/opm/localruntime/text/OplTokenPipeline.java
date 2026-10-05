package org.opm.localruntime.text;

import org.opm.localruntime.semantic.SemanticRevision;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import static org.opm.localruntime.text.OplSemanticSupport.*;

/** 句子分词、来源目录和 Trace 范围构建，不负责句式选择。 */
final class OplTokenPipeline {
    private OplTokenPipeline() { }

    static List<OplToken> tokenize(
            String sentenceId,
            String text,
            SemanticRevision.Fact fact,
            String templateId,
            OplGrammar grammar,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        List<OplToken.SourceRef> baseRefs = assetRefs(templateId, grammar, sentenceSlot);
        List<TokenSpan> spans = tokenSpans(text, fact, elements, features, states, sentenceSlot);
        List<OplToken> result = new ArrayList<>();
        int cursor = 0;
        for (TokenSpan span : spans) {
            if (cursor < span.start()) appendLiteralTokens(result, sentenceId, text, text.substring(cursor, span.start()), cursor, baseRefs);
            List<OplToken.SourceRef> refs = new ArrayList<>(baseRefs);
            refs.addAll(span.sourceRefs());
            appendToken(result, sentenceId, text, span.text(), span.kind(), span.start(), refs);
            cursor = span.end();
        }
        if (cursor < text.length()) appendLiteralTokens(result, sentenceId, text, text.substring(cursor), cursor, baseRefs);
        return semanticTokenSources(listSeparatorSources(result, text, fact, elements, features, states, sentenceSlot), fact,
                occurrenceIds, elements, features, states, occurrences, sentenceSlot);
    }

    static List<OplToken.SourceRef> assetRefs(String templateId, OplGrammar grammar, String sentenceSlot) {
        return List.of(
                source(OplToken.SourceKind.TEMPLATE, templateId, "pattern", null, sentenceSlot),
                source(OplToken.SourceKind.GRAMMAR, grammar.binding().id(), grammarPath(templateId), null, sentenceSlot));
    }

    static List<OplToken> semanticTokenSources(
            List<OplToken> tokens,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        List<OplToken> result = new ArrayList<>();
        for (OplToken token : tokens) {
            List<OplToken.SourceRef> refs = new ArrayList<>(token.sourceRefs());
            OplToken.Kind kind = isSentenceLabel(token.text(), fact, sentenceSlot) ? OplToken.Kind.RELATION_VERB : token.kind();
            switch (kind) {
                case ENTITY, STATE -> appendMentionSources(refs, token, fact, occurrenceIds, elements, features, states, occurrences, sentenceSlot);
                case RELATION_VERB -> appendRelationSources(refs, fact, occurrenceIds, occurrences, sentenceSlot);
                case CONTROL_KEYWORD -> appendControlSources(refs, fact, occurrenceIds, occurrences, sentenceSlot);
                case LIST_SEPARATOR -> appendListSources(refs, fact, occurrenceIds, occurrences, sentenceSlot);
                case KEYWORD -> appendKeywordSources(refs, token, fact, occurrenceIds, occurrences, sentenceSlot);
                case PUNCTUATION, WHITESPACE -> { }
                case PROCESS, OBJECT -> throw incomplete("ACTIVE tokenizer must not emit legacy Token kinds");
            }
            result.add(new OplToken(token.tokenId(), token.sentenceId(), token.ordinal(), token.text(), kind,
                    token.startUtf8Byte(), token.endUtf8Byte(), distinct(refs)));
        }
        return List.copyOf(result);
    }

    static boolean isSentenceLabel(String text, SemanticRevision.Fact fact, String sentenceSlot) {
        return fact.labels().stream().anyMatch(label -> sentenceLabelSlots(fact, sentenceSlot).contains(label.slotId())
                && label.text().equals(text));
    }

    static void appendMentionSources(
            List<OplToken.SourceRef> refs,
            OplToken token,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        Set<String> targets = new LinkedHashSet<>();
        for (SemanticRevision.Endpoint endpoint : sentenceEndpoints(fact, sentenceSlot)) {
            TokenMention mention = tokenMention(endpoint, elements, features, states);
            if (mention == null || !token.text().equals(mention.text())) continue;
            refs.add(source(OplToken.SourceKind.ENDPOINT, endpoint.id(), "target_id", endpoint.ordinal(), sentenceSlot));
            refs.addAll(mention.sourceRefs());
            for (OplToken.SourceRef ref : mention.sourceRefs()) {
                if (Set.of(OplToken.SourceKind.ELEMENT, OplToken.SourceKind.FEATURE, OplToken.SourceKind.STATE).contains(ref.sourceKind())) {
                    targets.add(ref.stableId());
                }
            }
        }
        appendOccurrenceSources(refs, occurrenceIds, occurrences, targets, sentenceSlot);
    }

    static void appendRelationSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.FACT, fact.id(), null, null, sentenceSlot));
        if ("OPL_PRODUCTION".equals(fact.source().sourceKind())
                && "opl.structural.exhibition.v1".equals(fact.source().sourceEntityId())) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_kind", null, sentenceSlot));
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_entity_id", null, sentenceSlot));
        }
        fact.labels().stream().filter(label -> sentenceLabelSlots(fact, sentenceSlot).contains(label.slotId())).forEach(label ->
                refs.add(source(OplToken.SourceKind.FACT, fact.id(), "labels[slot_id=" + label.slotId() + "].text", null, sentenceSlot)));
        refs.add(source(OplToken.SourceKind.CAPABILITY, fact.capability().capabilityId(), "capability_ref.capability_id", null, sentenceSlot));
        sentenceEndpoints(fact, sentenceSlot).forEach(endpoint -> refs.add(source(OplToken.SourceKind.ENDPOINT, endpoint.id(), "target_id", endpoint.ordinal(), sentenceSlot)));
        appendOccurrenceSources(refs, occurrenceIds, occurrences, Set.of(fact.id()), sentenceSlot);
        refs.add(source(OplToken.SourceKind.RULE, "rule.pending", null, null, sentenceSlot));
    }

    static void appendControlSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.FACT, fact.id(), null, null, sentenceSlot));
        fact.modifiers().stream().filter(modifier -> "control.capability".equals(modifier.id())).forEach(modifier ->
                refs.add(source(OplToken.SourceKind.CAPABILITY, modifier.value(), "modifiers[modifier_id=control.capability].value", null, sentenceSlot)));
        fact.modifiers().stream().filter(modifier -> modifier.id().startsWith("control.")).forEach(modifier ->
                refs.add(source(OplToken.SourceKind.MODIFIER, modifier.id(), "value", null, sentenceSlot)));
        appendOccurrenceSources(refs, occurrenceIds, occurrences, Set.of(fact.id()), sentenceSlot);
        refs.add(source(OplToken.SourceKind.RULE, "rule.pending.control", null, null, sentenceSlot));
    }

    static void appendListSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.FACT, fact.id(), null, null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.CAPABILITY, fact.capability().capabilityId(), "capability_ref.capability_id", null, sentenceSlot));
        appendOccurrenceSources(refs, occurrenceIds, occurrences, Set.of(fact.id()), sentenceSlot);
        refs.add(source(OplToken.SourceKind.RULE, "rule.pending", null, null, sentenceSlot));
    }

    static void appendKeywordSources(
            List<OplToken.SourceRef> refs,
            OplToken token,
            SemanticRevision.Fact fact,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Occurrence> occurrences,
            String sentenceSlot) {
        boolean durationLiteral = fact.modifiers().stream()
                .anyMatch(modifier -> "duration".equals(modifier.id()) && modifier.value().equals(token.text()));
        if (durationLiteral) {
            refs.add(source(OplToken.SourceKind.MODIFIER, "duration", "value", null, sentenceSlot));
        }
        if ("itself".equals(token.text())) {
            appendRelationSources(refs, fact, occurrenceIds, occurrences, sentenceSlot);
        }
        if ("at least one other".equals(token.text())) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "collection_completeness", null, sentenceSlot));
            appendOccurrenceSources(refs, occurrenceIds, occurrences, Set.of(fact.id()), sentenceSlot);
            refs.add(source(OplToken.SourceKind.RULE, "rule.pending", null, null, sentenceSlot));
        }
    }

    static void appendOccurrenceSources(
            List<OplToken.SourceRef> refs,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Occurrence> occurrences,
            Set<String> targetIds,
            String sentenceSlot) {
        occurrenceIds.stream().sorted().map(occurrences::get).filter(Objects::nonNull)
                .filter(occurrence -> targetIds.contains(occurrence.targetId()))
                .forEach(occurrence -> refs.add(source(OplToken.SourceKind.OCCURRENCE, occurrence.id(), null, null, sentenceSlot)));
    }

    static List<OplToken> listSeparatorSources(
            List<OplToken> tokens,
            String sentenceText,
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            String sentenceSlot) {
        if (!fact.capability().capabilityId().startsWith("CAP-ISO-STRUCT-")) return List.copyOf(tokens);
        List<OplToken> result = new ArrayList<>();
        for (int index = 0; index < tokens.size(); index++) {
            OplToken token = tokens.get(index);
            boolean listSeparator = token.kind() == OplToken.Kind.LIST_SEPARATOR;
            boolean comma = token.kind() == OplToken.Kind.PUNCTUATION && ",".equals(token.text());
            if (!listSeparator && !comma) {
                result.add(token);
                continue;
            }
            SemanticRevision.Endpoint left = adjacentEndpoint(tokens, index, -1, fact, elements, features, states);
            boolean completenessTail = listSeparator ? isCompletenessTail(tokens, index) : isCompletenessComma(tokens, index);
            SemanticRevision.Endpoint right = completenessTail ? null : adjacentEndpoint(tokens, index, 1, fact, elements, features, states);
            if (left == null || (!completenessTail && right == null)) {
                result.add(token);
                continue;
            }
            List<OplToken.SourceRef> refs = token.sourceRefs().stream()
                    .filter(ref -> ref.sourceKind() != OplToken.SourceKind.ENDPOINT
                            && ref.sourceKind() != OplToken.SourceKind.ELEMENT
                            && ref.sourceKind() != OplToken.SourceKind.FEATURE
                            && ref.sourceKind() != OplToken.SourceKind.STATE
                            && !(ref.sourceKind() == OplToken.SourceKind.FACT
                            && "collection_completeness".equals(ref.fieldPath())))
                    .collect(Collectors.toCollection(ArrayList::new));
            refs.add(source(OplToken.SourceKind.ENDPOINT, left.id(), "target_id", left.ordinal(), sentenceSlot));
            if (right != null) refs.add(source(OplToken.SourceKind.ENDPOINT, right.id(), "target_id", right.ordinal(), sentenceSlot));
            if (completenessTail) refs.add(source(OplToken.SourceKind.FACT, fact.id(), "collection_completeness", null, sentenceSlot));
            result.add(new OplToken(token.tokenId(), token.sentenceId(), token.ordinal(), token.text(), token.kind(),
                    token.startUtf8Byte(), token.endUtf8Byte(), distinct(refs)));
        }
        return List.copyOf(result);
    }

    static boolean isCompletenessTail(List<OplToken> tokens, int separatorIndex) {
        int next = nextContentToken(tokens, separatorIndex + 1);
        return next >= 0 && (tokens.get(next).text().startsWith("at least one other") || "other".equals(tokens.get(next).text()));
    }

    static boolean isCompletenessComma(List<OplToken> tokens, int commaIndex) {
        int andIndex = nextContentToken(tokens, commaIndex + 1);
        return andIndex >= 0 && "and".equals(tokens.get(andIndex).text()) && isCompletenessTail(tokens, andIndex);
    }

    static int nextContentToken(List<OplToken> tokens, int start) {
        for (int index = start; index < tokens.size(); index++) {
            if (tokens.get(index).kind() != OplToken.Kind.WHITESPACE) return index;
        }
        return -1;
    }

    static SemanticRevision.Endpoint adjacentEndpoint(
            List<OplToken> tokens,
            int separatorIndex,
            int direction,
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        for (int index = separatorIndex + direction; index >= 0 && index < tokens.size(); index += direction) {
            OplToken candidate = tokens.get(index);
            if (candidate.kind() != OplToken.Kind.ENTITY && candidate.kind() != OplToken.Kind.STATE) continue;
            for (SemanticRevision.Endpoint endpoint : sentenceEndpoints(fact, candidate.sourceRefs().getFirst().sentenceSlot())) {
                TokenMention mention = tokenMention(endpoint, elements, features, states);
                if (mention != null && candidate.text().equals(mention.text())) return endpoint;
            }
            return null;
        }
        return null;
    }

    static List<OplToken.SourceRef> endpointDerivedRefs(
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            String sentenceSlot) {
        List<OplToken.SourceRef> refs = new ArrayList<>();
        for (SemanticRevision.Endpoint endpoint : sentenceEndpoints(fact, sentenceSlot)) {
            switch (endpoint.targetKind()) {
                case ELEMENT -> {
                    if (endpoint.stateQualificationId() != null) {
                        SemanticRevision.State state = states.get(endpoint.stateQualificationId());
                        if (state != null) appendStateSources(refs, state, endpoint.ordinal(), elements, features);
                    }
                    if (elements.containsKey(endpoint.targetId())) {
                        refs.add(source(OplToken.SourceKind.ELEMENT, endpoint.targetId(), "name.local_name", endpoint.ordinal(), sentenceSlot));
                    }
                }
                case FEATURE -> {
                    SemanticRevision.Feature feature = features.get(endpoint.targetId());
                    if (feature != null) appendFeatureSources(refs, feature, endpoint.ordinal(), sentenceSlot);
                }
                case STATE -> {
                    SemanticRevision.State state = states.get(endpoint.targetId());
                    if (state == null) continue;
                    appendStateSources(refs, state, endpoint.ordinal(), elements, features);
                    if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) {
                        if (elements.containsKey(state.ownerElementId())) {
                            refs.add(source(OplToken.SourceKind.ELEMENT, state.ownerElementId(), "name.local_name", endpoint.ordinal(), sentenceSlot));
                        }
                    } else {
                        SemanticRevision.Feature feature = features.get(state.ownerElementId());
                        if (feature != null) appendFeatureSources(refs, feature, endpoint.ordinal(), sentenceSlot);
                    }
                }
                default -> { }
            }
        }
        return distinct(refs);
    }

    static void appendFeatureSources(List<OplToken.SourceRef> refs, SemanticRevision.Feature feature, int endpointOrdinal, String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "name.local_name", endpointOrdinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "owner_element_id", endpointOrdinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "feature_kind", endpointOrdinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.ELEMENT, feature.ownerElementId(), "name.local_name", endpointOrdinal, sentenceSlot));
    }

    static List<TokenSpan> tokenSpans(
            String text,
            SemanticRevision.Fact fact,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            String sentenceSlot) {
        List<TokenSpan> candidates = new ArrayList<>();
        for (SemanticRevision.Label label : fact.labels()) {
            if (!sentenceLabelSlots(fact, sentenceSlot).contains(label.slotId())) continue;
            int searchStart = 0;
            while (searchStart < text.length()) {
                int start = text.indexOf(label.text(), searchStart);
                if (start < 0) break;
                candidates.add(new TokenSpan(start, start + label.text().length(), label.text(), OplToken.Kind.RELATION_VERB,
                        List.of(source(OplToken.SourceKind.FACT, fact.id(), "labels[slot_id=" + label.slotId() + "].text", null, sentenceSlot))));
                searchStart = start + label.text().length();
            }
        }
        for (SemanticRevision.Endpoint endpoint : fact.endpoints()) {
            TokenMention mention = tokenMention(endpoint, elements, features, states);
            if (mention == null || mention.text().isEmpty()) continue;
            int searchStart = 0;
            while (searchStart < text.length()) {
                int start = text.indexOf(mention.text(), searchStart);
                if (start < 0) break;
                candidates.add(new TokenSpan(start, start + mention.text().length(), mention.text(), mention.kind(), mention.sourceRefs()));
                searchStart = start + mention.text().length();
            }
        }
        candidates.sort(Comparator.comparingInt(TokenSpan::start).thenComparing(Comparator.comparingInt(TokenSpan::end).reversed()));
        List<TokenSpan> selected = new ArrayList<>();
        for (TokenSpan candidate : candidates) {
            if (selected.isEmpty() || candidate.start() >= selected.getLast().end()) {
                selected.add(candidate);
            } else if (candidate.start() == selected.getLast().start() && candidate.end() == selected.getLast().end()) {
                TokenSpan previous = selected.removeLast();
                List<OplToken.SourceRef> refs = new ArrayList<>(previous.sourceRefs());
                refs.addAll(candidate.sourceRefs());
                selected.add(new TokenSpan(previous.start(), previous.end(), previous.text(), previous.kind(), distinct(refs)));
            }
        }
        return List.copyOf(selected);
    }

    static TokenMention tokenMention(
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        List<OplToken.SourceRef> refs = new ArrayList<>();
        if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT) {
            SemanticRevision.Element element = elements.get(endpoint.targetId());
            if (element == null) return null;
            if (endpoint.stateQualificationId() != null) {
                SemanticRevision.State state = states.get(endpoint.stateQualificationId());
                if (state != null && element.id().equals(state.ownerElementId())) {
                    appendStateSources(refs, state, endpoint.ordinal(), elements, features);
                    refs.add(source(OplToken.SourceKind.ELEMENT, element.id(), "name.local_name", endpoint.ordinal(), null));
                    return new TokenMention(state.name().localName() + " " + element.name().localName(), OplToken.Kind.STATE, refs);
                }
            }
            refs.add(source(OplToken.SourceKind.ELEMENT, element.id(), "name.local_name", endpoint.ordinal(), null));
            return new TokenMention(element.name().localName(), OplToken.Kind.ENTITY, refs);
        }
        if (endpoint.targetKind() == SemanticRevision.TargetKind.FEATURE) {
            SemanticRevision.Feature feature = features.get(endpoint.targetId());
            if (feature == null) return null;
            refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "name.local_name", endpoint.ordinal(), null));
            refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "owner_element_id", endpoint.ordinal(), null));
            refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "feature_kind", endpoint.ordinal(), null));
            refs.add(source(OplToken.SourceKind.ELEMENT, feature.ownerElementId(), "name.local_name", endpoint.ordinal(), null));
            return new TokenMention(feature.name().localName(), OplToken.Kind.ENTITY, refs);
        }
        if (endpoint.targetKind() == SemanticRevision.TargetKind.STATE) {
            SemanticRevision.State state = states.get(endpoint.targetId());
            if (state == null) return null;
            appendStateSources(refs, state, endpoint.ordinal(), elements, features);
            if (state.ownerTargetKind() == SemanticRevision.TargetKind.ELEMENT) {
                SemanticRevision.Element owner = elements.get(state.ownerElementId());
                if (owner != null) {
                    refs.add(source(OplToken.SourceKind.ELEMENT, owner.id(), "name.local_name", endpoint.ordinal(), null));
                    return new TokenMention(state.name().localName() + " " + owner.name().localName(), OplToken.Kind.STATE, refs);
                }
            }
            if (state.ownerTargetKind() == SemanticRevision.TargetKind.FEATURE) {
                SemanticRevision.Feature owner = features.get(state.ownerElementId());
                if (owner != null) {
                    refs.add(source(OplToken.SourceKind.FEATURE, owner.id(), "name.local_name", endpoint.ordinal(), null));
                    refs.add(source(OplToken.SourceKind.FEATURE, owner.id(), "owner_element_id", endpoint.ordinal(), null));
                    refs.add(source(OplToken.SourceKind.FEATURE, owner.id(), "feature_kind", endpoint.ordinal(), null));
                    refs.add(source(OplToken.SourceKind.ELEMENT, owner.ownerElementId(), "name.local_name", endpoint.ordinal(), null));
                }
            }
            return new TokenMention(state.name().localName(), OplToken.Kind.STATE, refs);
        }
        return null;
    }

    static void appendStateSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.State state,
            int endpointOrdinal,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features) {
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "name.local_name", endpointOrdinal, null));
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "owner_target_kind", endpointOrdinal, null));
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "owner_element_id", endpointOrdinal, null));
    }

    static void appendLiteralTokens(List<OplToken> target, String sentenceId, String sentenceText, String literal, int offset, List<OplToken.SourceRef> refs) {
        int cursor = 0;
        while (cursor < literal.length()) {
            int end;
            OplToken.Kind kind;
            char first = literal.charAt(cursor);
            if (Character.isWhitespace(first)) {
                end = cursor + 1;
                while (end < literal.length() && Character.isWhitespace(literal.charAt(end))) end++;
                kind = OplToken.Kind.WHITESPACE;
            } else if (first == '.' || first == ',') {
                end = cursor + 1;
                kind = OplToken.Kind.PUNCTUATION;
            } else {
                String phrase = phraseAt(literal, cursor);
                if (phrase != null) {
                    end = cursor + phrase.length();
                    kind = phrase.equals("and") || phrase.equals("as well as") ? OplToken.Kind.LIST_SEPARATOR
                            : isControlPhrase(phrase) ? OplToken.Kind.CONTROL_KEYWORD : OplToken.Kind.RELATION_VERB;
                } else {
                    end = cursor + 1;
                    while (end < literal.length() && !Character.isWhitespace(literal.charAt(end)) && literal.charAt(end) != '.' && literal.charAt(end) != ',') end++;
                    kind = OplToken.Kind.KEYWORD;
                }
            }
            appendToken(target, sentenceId, sentenceText, literal.substring(cursor, end), kind, offset + cursor, refs);
            cursor = end;
        }
    }

    static String phraseAt(String text, int offset) {
        for (String phrase : List.of("is an instance of", "are instances of", "at least one other", "in which case", "as well as", "occurs if", "is skipped", "consists of", "relates to", "are related", "otherwise", "initiates", "consumes", "affects", "requires", "handles", "invokes", "changes", "yields", "exhibits", "and", "else", "are", "is")) {
            if (text.startsWith(phrase, offset) && phraseBoundary(text, offset, phrase.length())) return phrase;
        }
        return null;
    }

    static boolean phraseBoundary(String text, int offset, int length) {
        return (offset == 0 || !Character.isLetterOrDigit(text.charAt(offset - 1)))
                && (offset + length == text.length() || !Character.isLetterOrDigit(text.charAt(offset + length)));
    }

    static boolean isControlPhrase(String phrase) {
        return Set.of("initiates", "occurs if", "in which case", "otherwise", "else", "is skipped").contains(phrase);
    }

    static void appendToken(List<OplToken> target, String sentenceId, String sentenceText, String text, OplToken.Kind kind, int characterOffset, List<OplToken.SourceRef> refs) {
        int ordinal = target.size();
        int start = utf8Offset(sentenceText, characterOffset);
        int end = utf8Offset(sentenceText, characterOffset + text.length());
        target.add(new OplToken(identifier("token", sentenceId, Integer.toString(ordinal), text), sentenceId, ordinal, text, kind, start, end, distinct(refs)));
    }

    static List<OplToken.SourceRef> baseRefs(
            SemanticRevision.Fact fact,
            String templateId,
            OplGrammar grammar,
            List<String> occurrenceIds,
            String sentenceSlot) {
        List<OplToken.SourceRef> refs = new ArrayList<>();
        refs.add(source(OplToken.SourceKind.FACT, fact.id(), "", null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.CAPABILITY, fact.capability().capabilityId(), "capability_ref.capability_id", null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.TEMPLATE, templateId, "pattern", null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.RULE, templateId, "", null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.GRAMMAR, grammar.binding().id(), "digest=" + grammar.binding().digest(), null, sentenceSlot));
        if ("OPL_PRODUCTION".equals(fact.source().sourceKind())
                && "opl.structural.exhibition.v1".equals(fact.source().sourceEntityId())) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_kind", null, sentenceSlot));
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_entity_id", null, sentenceSlot));
        }
        for (SemanticRevision.Endpoint endpoint : sentenceEndpoints(fact, sentenceSlot)) {
            refs.add(source(OplToken.SourceKind.ENDPOINT, endpoint.id(), "target_id", endpoint.ordinal(), sentenceSlot));
        }
        for (SemanticRevision.Label label : fact.labels()) {
            if (!sentenceLabelSlots(fact, sentenceSlot).contains(label.slotId())) continue;
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "labels[slot_id=" + label.slotId() + "].text", null, sentenceSlot));
        }
        if (fact.collectionCompleteness() == SemanticRevision.CollectionCompleteness.INCOMPLETE) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "collection_completeness", null, sentenceSlot));
        }
        occurrenceIds.forEach(occurrenceId -> refs.add(source(OplToken.SourceKind.OCCURRENCE, occurrenceId, "", null, sentenceSlot)));
        for (SemanticRevision.Modifier modifier : fact.modifiers()) {
            refs.add(source(OplToken.SourceKind.MODIFIER, modifier.id(), "value", null, sentenceSlot));
            if ("control.capability".equals(modifier.id())) {
                refs.add(source(OplToken.SourceKind.CAPABILITY, modifier.value(), "modifiers[modifier_id=control.capability].value", null, sentenceSlot));
            }
        }
        return distinct(refs);
    }

    static List<SemanticRevision.Endpoint> sentenceEndpoints(SemanticRevision.Fact fact, String sentenceSlot) {
        List<SemanticRevision.Endpoint> endpoints = fact.endpoints().stream()
                .sorted(Comparator.comparingInt(SemanticRevision.Endpoint::ordinal)).toList();
        if ("REVERSE".equals(sentenceSlot) && fact.direction() == SemanticRevision.Direction.BIDIRECTIONAL) {
            List<SemanticRevision.Endpoint> reverse = new ArrayList<>(endpoints);
            java.util.Collections.reverse(reverse);
            return List.copyOf(reverse);
        }
        return endpoints;
    }

    static Set<String> sentenceLabelSlots(SemanticRevision.Fact fact, String sentenceSlot) {
        return switch (sentenceSlot) {
            case "FORWARD" -> Set.of("forward_tag");
            case "REVERSE" -> Set.of("reverse_tag");
            case "RECIPROCAL" -> switch (fact.capability().capabilityId()) {
                case "CAP-ISO-STRUCT-004" -> Set.of("reciprocal");
                case "CAP-ISO-STRUCT-010" -> Set.of("reciprocal_tag");
                default -> Set.of();
            };
            default -> fact.labels().stream().map(SemanticRevision.Label::slotId).collect(Collectors.toUnmodifiableSet());
        };
    }

    static List<OplToken.SourceRef> activeSourceCatalog(
            SemanticRevision.Fact fact,
            OplGrammar.Template template,
            OplGrammar grammar,
            List<String> ruleIds,
            List<String> occurrenceIds,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states) {
        String sentenceSlot = template.sentenceSlot();
        List<OplToken.SourceRef> refs = new ArrayList<>();
        refs.add(source(OplToken.SourceKind.FACT, fact.id(), null, null, sentenceSlot));
        if ("OPL_PRODUCTION".equals(fact.source().sourceKind())
                && "opl.structural.exhibition.v1".equals(fact.source().sourceEntityId())) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_kind", null, sentenceSlot));
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "source.source_entity_id", null, sentenceSlot));
        }
        refs.add(source(OplToken.SourceKind.CAPABILITY, fact.capability().capabilityId(), "capability_ref.capability_id", null, sentenceSlot));
        fact.modifiers().stream().filter(modifier -> "control.capability".equals(modifier.id()))
                .forEach(modifier -> refs.add(source(OplToken.SourceKind.CAPABILITY, modifier.value(), "modifiers[modifier_id=control.capability].value", null, sentenceSlot)));
        for (SemanticRevision.Endpoint endpoint : sentenceEndpoints(fact, sentenceSlot)) {
            refs.add(source(OplToken.SourceKind.ENDPOINT, endpoint.id(), "target_id", endpoint.ordinal(), sentenceSlot));
            appendEndpointCatalogSources(refs, endpoint, elements, features, states, sentenceSlot);
        }
        fact.labels().stream().filter(label -> sentenceLabelSlots(fact, sentenceSlot).contains(label.slotId()))
                .forEach(label -> refs.add(source(OplToken.SourceKind.FACT, fact.id(), "labels[slot_id=" + label.slotId() + "].text", null, sentenceSlot)));
        if (fact.collectionCompleteness() == SemanticRevision.CollectionCompleteness.INCOMPLETE) {
            refs.add(source(OplToken.SourceKind.FACT, fact.id(), "collection_completeness", null, sentenceSlot));
        }
        fact.modifiers().stream().sorted(Comparator.comparingInt(OplTokenPipeline::modifierCatalogRank).thenComparing(SemanticRevision.Modifier::id))
                .forEach(modifier -> refs.add(source(OplToken.SourceKind.MODIFIER, modifier.id(), "value", null, sentenceSlot)));
        occurrenceIds.stream().sorted().forEach(occurrenceId -> refs.add(source(OplToken.SourceKind.OCCURRENCE, occurrenceId, null, null, sentenceSlot)));
        refs.add(source(OplToken.SourceKind.TEMPLATE, template.templateId(), "pattern", null, sentenceSlot));
        refs.add(source(OplToken.SourceKind.GRAMMAR, grammar.binding().id(), grammarPath(template.templateId()), null, sentenceSlot));
        ruleIds.forEach(ruleId -> refs.add(source(OplToken.SourceKind.RULE, ruleId, null, null, sentenceSlot)));
        return List.copyOf(refs);
    }

    static int modifierCatalogRank(SemanticRevision.Modifier modifier) {
        return switch (modifier.id()) {
            case "control.capability" -> 0;
            case "control.segment" -> 1;
            default -> 2;
        };
    }

    static void appendEndpointCatalogSources(
            List<OplToken.SourceRef> refs,
            SemanticRevision.Endpoint endpoint,
            Map<String, SemanticRevision.Element> elements,
            Map<String, SemanticRevision.Feature> features,
            Map<String, SemanticRevision.State> states,
            String sentenceSlot) {
        if (endpoint.targetKind() == SemanticRevision.TargetKind.ELEMENT) {
            if (endpoint.stateQualificationId() != null) {
                SemanticRevision.State state = states.get(endpoint.stateQualificationId());
                if (state != null) appendStateCatalogSources(refs, state, endpoint.ordinal(), sentenceSlot);
            }
            refs.add(source(OplToken.SourceKind.ELEMENT, endpoint.targetId(), "name.local_name", endpoint.ordinal(), sentenceSlot));
            return;
        }
        if (endpoint.targetKind() == SemanticRevision.TargetKind.FEATURE) {
            SemanticRevision.Feature feature = features.get(endpoint.targetId());
            if (feature != null) appendFeatureCatalogSources(refs, feature, endpoint.ordinal(), sentenceSlot);
            return;
        }
        SemanticRevision.State state = states.get(endpoint.targetId());
        if (state == null) return;
        appendStateCatalogSources(refs, state, endpoint.ordinal(), sentenceSlot);
        if (state.ownerTargetKind() == SemanticRevision.TargetKind.FEATURE) {
            SemanticRevision.Feature feature = features.get(state.ownerElementId());
            if (feature != null) appendFeatureCatalogSources(refs, feature, endpoint.ordinal(), sentenceSlot);
        } else {
            refs.add(source(OplToken.SourceKind.ELEMENT, state.ownerElementId(), "name.local_name", endpoint.ordinal(), sentenceSlot));
        }
    }

    static void appendStateCatalogSources(List<OplToken.SourceRef> refs, SemanticRevision.State state, int ordinal, String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "name.local_name", ordinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "owner_target_kind", ordinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.STATE, state.id(), "owner_element_id", ordinal, sentenceSlot));
    }

    static void appendFeatureCatalogSources(List<OplToken.SourceRef> refs, SemanticRevision.Feature feature, int ordinal, String sentenceSlot) {
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "name.local_name", ordinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "owner_element_id", ordinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.FEATURE, feature.id(), "feature_kind", ordinal, sentenceSlot));
        refs.add(source(OplToken.SourceKind.ELEMENT, feature.ownerElementId(), "name.local_name", ordinal, sentenceSlot));
    }

    static List<OplToken.SourceRef> traceSources(OplSentence sentence, SemanticRevision.Fact fact, String templateId, OplGrammar grammar) {
        return tokenSourceCatalog(sentence);
    }

    static List<OplToken.SourceRef> traceSources(
            OplSentence sentence,
            SemanticRevision.Fact fact,
            String templateId,
            OplGrammar grammar,
            List<String> ruleIds) {
        return tokenSourceCatalog(sentence);
    }

    static List<OplToken.SourceRef> tokenSourceCatalog(OplSentence sentence) {
        List<OplToken.SourceRef> refs = new ArrayList<>();
        sentence.tokens().forEach(token -> refs.addAll(token.sourceRefs()));
        return distinct(refs);
    }

    static List<OplTextTrace.TokenRange> tokenRanges(OplSentence sentence, List<OplToken.SourceRef> sourceOrder) {
        Set<OplToken.SourceKind> locatableKinds = Set.of(OplToken.SourceKind.FACT, OplToken.SourceKind.ENDPOINT,
                OplToken.SourceKind.ELEMENT, OplToken.SourceKind.FEATURE, OplToken.SourceKind.STATE,
                OplToken.SourceKind.MODIFIER, OplToken.SourceKind.OCCURRENCE);
        List<OplTextTrace.TokenRange> result = new ArrayList<>();
        Set<String> uniqueRanges = new LinkedHashSet<>();
        for (OplToken.SourceRef source : sourceOrder) {
            if (!locatableKinds.contains(source.sourceKind())) continue;
            List<OplToken> matched = sentence.tokens().stream().filter(token -> token.sourceRefs().contains(source)).toList();
            int start = -1;
            int end = -1;
            for (OplToken token : matched) {
                if (start >= 0 && token.startUtf8Byte() != end) {
                    appendTokenRange(result, uniqueRanges, source.stableId(), start, end);
                    start = -1;
                }
                if (start < 0) start = token.startUtf8Byte();
                end = token.endUtf8Byte();
            }
            if (start >= 0) appendTokenRange(result, uniqueRanges, source.stableId(), start, end);
        }
        return List.copyOf(result);
    }

    static void appendTokenRange(
            List<OplTextTrace.TokenRange> ranges,
            Set<String> uniqueRanges,
            String inputId,
            int start,
            int end) {
        if (uniqueRanges.add(inputId + "\u0000" + start + "\u0000" + end)) {
            ranges.add(new OplTextTrace.TokenRange(inputId, start, end));
        }
    }

    static List<String> ruleIds(SemanticRevision.Fact fact, TextGenerationAssets assets) {
        List<String> ids = new ArrayList<>();
        ids.add(assets.capability(fact.capability().capabilityId()).ruleRef());
        fact.modifiers().stream()
                .filter(modifier -> "control.capability".equals(modifier.id()))
                .map(SemanticRevision.Modifier::value)
                .findFirst()
                .ifPresent(capability -> ids.add(assets.capability(capability).ruleRef()));
        return List.copyOf(ids);
    }

    static List<OplToken> rewriteTokens(List<OplToken> tokens, List<String> ruleIds, OplGrammar grammar) {
        List<OplToken> result = new ArrayList<>();
        for (OplToken token : tokens) {
            String templateId = token.sourceRefs().stream().filter(ref -> ref.sourceKind() == OplToken.SourceKind.TEMPLATE)
                    .map(OplToken.SourceRef::stableId).findFirst()
                    .orElseThrow(() -> failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Token does not reference a Template"));
            String sentenceSlot = token.sourceRefs().stream().map(OplToken.SourceRef::sentenceSlot)
                    .filter(Objects::nonNull).findFirst().orElse("SINGLE");
            List<OplToken.SourceRef> refs = new ArrayList<>();
            for (OplToken.SourceRef ref : token.sourceRefs()) {
                if (ref.sourceKind() == OplToken.SourceKind.RULE) {
                    String ruleId = token.kind() == OplToken.Kind.CONTROL_KEYWORD && ruleIds.size() > 1
                            ? ruleIds.getLast() : ruleIds.getFirst();
                    refs.add(source(OplToken.SourceKind.RULE, ruleId, "", ref.endpointOrdinal(), sentenceSlot));
                } else if (ref.sourceKind() == OplToken.SourceKind.GRAMMAR) {
                    refs.add(source(OplToken.SourceKind.GRAMMAR, grammar.binding().id(), grammarPath(templateId), ref.endpointOrdinal(), sentenceSlot));
                } else {
                    refs.add(source(ref.sourceKind(), ref.stableId(), ref.fieldPath(), ref.endpointOrdinal(), sentenceSlot));
                }
            }
            result.add(new OplToken(token.tokenId(), token.sentenceId(), token.ordinal(), token.text(), token.kind(),
                    token.startUtf8Byte(), token.endUtf8Byte(), distinct(refs)));
        }
        return List.copyOf(result);
    }

    static String templateId(OplSentence sentence) {
        return sentence.tokens().stream().flatMap(token -> token.sourceRefs().stream())
                .filter(ref -> ref.sourceKind() == OplToken.SourceKind.TEMPLATE)
                .map(OplToken.SourceRef::stableId)
                .findFirst()
                .orElseThrow(() -> failure(OplGenerationCode.TEXT_TRACE_INCOMPLETE, "Sentence does not reference a Template"));
    }

    static String grammarPath(String templateId) {
        return "templates[template_id=" + templateId + "].pattern";
    }

    static OplToken.SourceRef source(OplToken.SourceKind kind, String stableId, String fieldPath, Integer endpointOrdinal, String sentenceSlot) {
        return new OplToken.SourceRef(kind, stableId, fieldPath == null || fieldPath.isEmpty() ? null : fieldPath, endpointOrdinal, sentenceSlot);
    }

    static <T> List<T> distinct(List<T> values) {
        return List.copyOf(new LinkedHashSet<>(values));
    }

    record TokenMention(String text, OplToken.Kind kind, List<OplToken.SourceRef> sourceRefs) { }

    record TokenSpan(int start, int end, String text, OplToken.Kind kind, List<OplToken.SourceRef> sourceRefs) { }
}
