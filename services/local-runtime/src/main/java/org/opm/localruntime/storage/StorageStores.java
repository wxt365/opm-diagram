package org.opm.localruntime.storage;

import java.nio.file.Path;
import java.util.Locale;

/** 命令行和测试工厂同样显式选择数据库，不在连接失败时降级。 */
public final class StorageStores {
    private StorageStores() { }
    public static RuntimeStore tools(Path root) {
        String type = System.getProperty("opm.storage.type", System.getenv().getOrDefault("OPM_STORAGE_TYPE", "sqlite"));
        return switch (type.toLowerCase(Locale.ROOT)) {
            case "sqlite" -> new SqliteStore(root);
            default -> throw new IllegalArgumentException("不支持的数据库类型：" + type);
        };
    }
}
