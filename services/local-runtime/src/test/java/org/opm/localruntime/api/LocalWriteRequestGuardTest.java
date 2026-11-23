package org.opm.localruntime.api;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;

class LocalWriteRequestGuardTest {
    private static final String LAN = "http://192.168.2.182:5177";
    private final LocalSessionToken session = new LocalSessionToken("test-session");

    @Test
    void 默认只允许同主机回环来源() {
        LocalWriteRequestGuard guard = new LocalWriteRequestGuard(session);
        assertTrue(guard.validate(request("http://127.0.0.1:5177", "test-session")));
        assertThrows(ApiException.class, () -> guard.validate(request(LAN, "test-session")));
    }

    @Test
    void 显式来源允许通过本地代理访问且保留回环兼容() {
        LocalWriteRequestGuard guard = new LocalWriteRequestGuard(session, " " + LAN + ",https://192.168.64.1:5177 ");
        assertTrue(guard.validate(request(LAN, "test-session")));
        assertTrue(guard.validate(request("https://192.168.64.1:5177", "test-session")));
        assertTrue(guard.validate(request("http://127.0.0.1:5177", "test-session")));
    }

    @Test
    void 来源必须精确匹配且有效会话不可省略() {
        LocalWriteRequestGuard guard = new LocalWriteRequestGuard(session, LAN);
        for (String origin : new String[]{null, "", "null", "https://example.com", "http://192.168.2.182:5178",
                "https://192.168.2.182:5177", LAN + "/", LAN + "@example.com", LAN + "?q=1"}) {
            ApiException error = assertThrows(ApiException.class, () -> guard.validate(request(origin, "test-session")));
            assertEquals(403, error.status());
        }
        assertThrows(ApiException.class, () -> guard.validate(request(LAN, null)));
        assertThrows(ApiException.class, () -> guard.validate(request(LAN, "forged")));
        MockHttpServletRequest foreignHost = request(LAN, "test-session");
        foreignHost.setServerName("example.com");
        assertThrows(ApiException.class, () -> guard.validate(foreignHost));
    }

    @Test
    void 拒绝无效配置而非放宽匹配() {
        for (String origin : new String[]{"*", "http://*.example.com", "file://example.com", LAN + "/path",
                "http://user@192.168.2.182:5177", LAN + "?q=1", LAN + "#hash", "http://192.168.2.182:99999"}) {
            assertThrows(IllegalArgumentException.class, () -> new LocalWriteRequestGuard(session, origin));
        }
    }

    @Test
    void 草稿复用可信来源且保持错误协议() {
        DraftWriteRequestGuard guard = new DraftWriteRequestGuard(session, LAN);
        assertTrue(guard.preHandle(request(LAN, "test-session"), new MockHttpServletResponse(), new Object()));
        assertThrows(org.opm.localruntime.application.DraftWorkspaceService.Failure.class,
                () -> guard.preHandle(request(LAN, "forged"), new MockHttpServletResponse(), new Object()));
    }

    private MockHttpServletRequest request(String origin, String token) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/projects");
        request.setServerName("127.0.0.1");
        if (origin != null) request.addHeader("Origin", origin);
        if (token != null) request.addHeader("X-OPM-Session", token);
        return request;
    }
}
