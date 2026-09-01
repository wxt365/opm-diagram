package org.opm.localruntime.exchange;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.DecimalNode;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/** 交换包业务 JSON 的 Decimal 规范化器；Manifest 仍使用受限 RFC 8785 JCS。 */
final class ExchangeJsonCanonicalizer {

    private static final int MAX_DEPTH = 64;
    private static final int MAX_STRING_LENGTH = 1024 * 1024;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper(
            com.fasterxml.jackson.core.JsonFactory.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build())
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);

    private ExchangeJsonCanonicalizer() {
    }

    static byte[] canonicalize(byte[] raw) {
        if (raw.length == 0 || hasUtf8Bom(raw)) {
            throw invalid("JSON entry must be non-empty UTF-8 without BOM.");
        }
        try {
            assertNoExponent(raw);
            JsonNode root = OBJECT_MAPPER.readTree(raw);
            if (root == null) throw invalid("JSON entry must have one value.");
            assertLimits(root, 1);
            StringBuilder output = new StringBuilder(raw.length);
            append(root, output);
            return output.toString().getBytes(StandardCharsets.UTF_8);
        } catch (ExchangeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ExchangeException("EXCHANGE_MANIFEST_INVALID", "JSON entry is invalid.", exception);
        }
    }

    private static void assertLimits(JsonNode value, int depth) {
        if (depth > MAX_DEPTH) throw invalid("JSON depth exceeds the configured limit.");
        if (value.isTextual() && value.textValue().length() > MAX_STRING_LENGTH) throw invalid("JSON string exceeds the configured limit.");
        if (value.isArray()) for (JsonNode item : value) assertLimits(item, depth + 1);
        if (value.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = value.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if (field.getKey().length() > MAX_STRING_LENGTH) throw invalid("JSON key exceeds the configured limit.");
                assertLimits(field.getValue(), depth + 1);
            }
        }
    }

    private static void assertNoExponent(byte[] raw) throws Exception {
        try (JsonParser parser = OBJECT_MAPPER.getFactory().createParser(new ByteArrayInputStream(raw))) {
            while (parser.nextToken() != null) {
                if (parser.currentToken() == JsonToken.VALUE_NUMBER_FLOAT
                        && (parser.getText().contains("e") || parser.getText().contains("E"))) {
                    throw invalid("JSON Decimal must not use exponent notation.");
                }
            }
        }
    }

    private static void append(JsonNode value, StringBuilder output) {
        if (value.isNull()) {
            output.append("null");
        } else if (value.isBoolean()) {
            output.append(value.booleanValue());
        } else if (value.isIntegralNumber()) {
            output.append(value.bigIntegerValue());
        } else if (value.isFloatingPointNumber() || value instanceof DecimalNode) {
            BigDecimal decimal = value.decimalValue().stripTrailingZeros();
            if (!Double.isFinite(decimal.doubleValue())) throw invalid("JSON Decimal exceeds the finite double range.");
            output.append(decimal.signum() == 0 ? "0" : decimal.toPlainString());
        } else if (value.isTextual()) {
            try {
                output.append(OBJECT_MAPPER.writeValueAsString(value.textValue()));
            } catch (Exception exception) {
                throw new ExchangeException("EXCHANGE_MANIFEST_INVALID", "JSON string cannot be escaped.", exception);
            }
        } else if (value.isArray()) {
            output.append('[');
            for (int index = 0; index < value.size(); index++) {
                if (index > 0) output.append(',');
                append(value.get(index), output);
            }
            output.append(']');
        } else if (value.isObject()) {
            List<Map.Entry<String, JsonNode>> fields = new ArrayList<>();
            Iterator<Map.Entry<String, JsonNode>> iterator = value.fields();
            iterator.forEachRemaining(fields::add);
            fields.sort(Map.Entry.comparingByKey(Comparator.naturalOrder()));
            output.append('{');
            for (int index = 0; index < fields.size(); index++) {
                if (index > 0) output.append(',');
                try {
                    output.append(OBJECT_MAPPER.writeValueAsString(fields.get(index).getKey())).append(':');
                } catch (Exception exception) {
                    throw new ExchangeException("EXCHANGE_MANIFEST_INVALID", "JSON key cannot be escaped.", exception);
                }
                append(fields.get(index).getValue(), output);
            }
            output.append('}');
        } else {
            throw invalid("JSON value is outside the exchange canonical domain.");
        }
    }

    private static boolean hasUtf8Bom(byte[] raw) {
        return raw.length >= 3 && raw[0] == (byte) 0xef && raw[1] == (byte) 0xbb && raw[2] == (byte) 0xbf;
    }

    private static ExchangeException invalid(String message) {
        return new ExchangeException("EXCHANGE_MANIFEST_INVALID", message);
    }
}
