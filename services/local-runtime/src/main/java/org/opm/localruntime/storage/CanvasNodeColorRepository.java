package org.opm.localruntime.storage;

import org.springframework.stereotype.Repository;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;

@Repository
public class CanvasNodeColorRepository {
    private final RuntimeStore store;
    public CanvasNodeColorRepository(RuntimeStore store) { this.store = store; }

    public Map<String, Map<String, String>> read() {
        var result = new LinkedHashMap<String, Map<String, String>>();
        try (var connection = store.catalogConnection(); var statement = connection.prepareStatement("SELECT kind, stroke, fill FROM canvas_node_color ORDER BY kind"); var rows = statement.executeQuery()) {
            while (rows.next()) {
                var colors = new LinkedHashMap<String, String>();
                if (rows.getString(2) != null) colors.put("stroke", rows.getString(2));
                if (rows.getString(3) != null) colors.put("fill", rows.getString(3));
                result.put(rows.getString(1), colors);
            }
            return result;
        } catch (SQLException e) { throw new StorageAccessException("Cannot read canvas node colors", e); }
    }

    public void write(String kind, Map<String, String> colors) {
        try (var connection = store.catalogConnection(); var statement = connection.prepareStatement(
                "INSERT INTO canvas_node_color(kind,stroke,fill) VALUES (?,?,?) ON CONFLICT (kind) DO UPDATE SET stroke=EXCLUDED.stroke, fill=EXCLUDED.fill")) {
            statement.setString(1, kind); statement.setString(2, colors.get("stroke")); statement.setString(3, colors.get("fill"));
            statement.executeUpdate();
        } catch (SQLException e) { throw new StorageAccessException("Cannot save canvas node colors", e); }
    }
}
