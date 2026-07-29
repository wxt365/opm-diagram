package org.opm.localruntime.text;

import org.opm.localruntime.semantic.SemanticRevision;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public record OplGrammar(Binding binding, List<Template> templates) {

    public OplGrammar {
        binding = Objects.requireNonNull(binding, "binding must not be null");
        templates = List.copyOf(Objects.requireNonNull(templates, "templates must not be null"));
        Map<String, Template> indexed = new LinkedHashMap<>();
        for (Template template : templates) {
            if (indexed.putIfAbsent(template.templateId(), template) != null) {
                throw new IllegalArgumentException("templates must not contain duplicate templateId");
            }
        }
    }

    public Optional<Template> template(String templateId) {
        return templates.stream().filter(template -> template.templateId().equals(templateId)).findFirst();
    }

    public boolean matches(SemanticRevision.AssetReference reference) {
        return binding.id().equals(reference.id())
                && binding.version().equals(reference.version())
                && binding.digest().equals(reference.sha256());
    }

    public record Binding(String id, String version, String digest) {
        public Binding {
            requireNonBlank(id, "id");
            requireNonBlank(version, "version");
            requireNonBlank(digest, "digest");
        }
    }

    public record Template(String templateId, int precedence) {
        public Template {
            requireNonBlank(templateId, "templateId");
        }
    }

    private static void requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}
