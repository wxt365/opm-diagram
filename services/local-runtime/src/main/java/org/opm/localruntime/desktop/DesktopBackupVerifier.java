package org.opm.localruntime.desktop;

import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.sql.DriverManager;
import org.sqlite.SQLiteConfig;
import org.sqlite.Function;
import java.sql.SQLException;

/** 以独立只读进程验证待恢复的 OPM 数据库，不启动 Spring、不执行迁移。 */
public final class DesktopBackupVerifier {
    private DesktopBackupVerifier() { }
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("必须提供待验证工作区");
        verify(Path.of(args[0]));
        System.out.println("{\"status\":\"VALID\"}");
    }
    public static void verify(Path workspace) throws Exception {
        Path root = workspace.toRealPath().resolve("runtime-data");
        if (!Files.exists(root)) return;
        try (var files = Files.walk(root)) {
            for (Path path : files.toList()) {
                if (Files.isSymbolicLink(path)) throw new IllegalArgumentException("备份不允许符号链接");
                if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) || !path.getFileName().toString().endsWith(".db")) continue;
                SQLiteConfig config = new SQLiteConfig(); config.setReadOnly(true); config.enforceForeignKeys(true);
                try (var connection = DriverManager.getConnection("jdbc:sqlite:" + path, config.toProperties());
                     var statement = connection.createStatement()) {
                    // 完整性检查会计算表 CHECK；沿用存储层的项目范围函数，不能跳过约束。
                    Path relative = root.relativize(path);
                    String project = relative.getNameCount() == 3 && relative.getName(0).toString().equals("projects")
                            && relative.getFileName().toString().equals("project.db") ? relative.getName(1).toString() : "";
                    Function.create(connection, "project_scope", new Function() {
                        @Override protected void xFunc() throws SQLException { if (project.isEmpty()) result(); else result(project); }
                    });
                    try (var result = statement.executeQuery("PRAGMA integrity_check")) {
                        if (!result.next() || !"ok".equals(result.getString(1)) || result.next()) throw new IllegalArgumentException("数据库完整性检查失败");
                    }
                    try (var result = statement.executeQuery("PRAGMA foreign_key_check")) {
                        if (result.next()) throw new IllegalArgumentException("数据库外键检查失败");
                    }
                }
            }
        }
    }
}
