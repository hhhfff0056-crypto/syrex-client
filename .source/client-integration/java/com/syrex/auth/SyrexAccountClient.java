package com.syrex.auth;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.io.IOException;

/**
 * Standalone Java 17+/Gson adapter for Syrex Supabase Auth + device binding.
 * Hook this into your EXISTING client login screen and existing HWID provider.
 * The provided HWID stays local: only its SHA-256 hash is sent over HTTPS.
 * Do not persist passwords or print tokens or HWIDs to logs.
 */
public final class SyrexAccountClient {
    private final String supabaseUrl;
    private final String publishableKey;
    private final HttpClient http;

    public record LoginResult(String accessToken, String refreshToken,
                              String edition, boolean premium,
                              long uid, String expiresAt) { }

    public SyrexAccountClient(String supabaseUrl, String publishableKey) {
        if (supabaseUrl == null || !supabaseUrl.startsWith("https://") ||
            publishableKey == null || !publishableKey.startsWith("sb_publishable_")) {
            throw new IllegalArgumentException("Invalid Syrex public Supabase configuration");
        }
        this.supabaseUrl = supabaseUrl.replaceAll("/+$", "");
        this.publishableKey = publishableKey;
        this.http = HttpClient.newHttpClient();
    }

    /** Call only after explicit consent to associate this computer with the account. */
    public LoginResult loginAndBind(String email, char[] password, String rawHwid)
            throws IOException, InterruptedException {
        if (email == null || email.isBlank() || password == null || password.length == 0) {
            throw new IllegalArgumentException("Email and password are required");
        }
        JsonObject credentials = new JsonObject();
        credentials.addProperty("email", email.trim());
        credentials.addProperty("password", new String(password)); // Never log or save.
        JsonObject auth = post("/auth/v1/token?grant_type=password", credentials, null);
        String accessToken = required(auth, "access_token");
        String refreshToken = required(auth, "refresh_token");
        JsonObject device = bindOrVerify(accessToken, rawHwid, "bind");
        return new LoginResult(
            accessToken,
            refreshToken,
            required(device, "edition"),
            device.get("premium").getAsBoolean(),
            device.get("uid").getAsLong(),
            device.has("expiresAt") && !device.get("expiresAt").isJsonNull()
                ? device.get("expiresAt").getAsString() : null
        );
    }

    /** Run again at client launch to confirm the current account/device and subscription. */
    public JsonObject verify(String accessToken, String rawHwid)
            throws IOException, InterruptedException {
        return bindOrVerify(accessToken, rawHwid, "verify");
    }

    private JsonObject bindOrVerify(String token, String rawHwid, String action)
            throws IOException, InterruptedException {
        if (rawHwid == null || rawHwid.isBlank()) {
            throw new IllegalArgumentException("A stable device identifier is required");
        }
        JsonObject body = new JsonObject();
        body.addProperty("action", action);
        // Existing client's HWID provider supplies the stable identifier locally.
        // Raw serials/MAC/system details are never included in HTTP requests.
        body.addProperty("hwidHash", sha256("syrex-hwid-v1:" + rawHwid));
        return post("/functions/v1/syrex-device", body, token);
    }

    private JsonObject post(String path, JsonObject body, String token)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(supabaseUrl + path))
            .header("apikey", publishableKey)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8));
        if (token != null) builder.header("Authorization", "Bearer " + token);
        HttpResponse<String> response = http.send(
            builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        JsonObject data;
        try {
            data = JsonParser.parseString(response.body()).getAsJsonObject();
        } catch (RuntimeException e) {
            throw new IOException("Syrex returned an invalid response", e);
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            String reason = data.has("error") ? data.get("error").getAsString()
                : "HTTP " + response.statusCode();
            throw new IOException(reason);
        }
        return data;
    }

    private static String required(JsonObject value, String name) throws IOException {
        if (!value.has(name) || value.get(name).isJsonNull()) {
            throw new IOException("Missing required response field: " + name);
        }
        return value.get(name).getAsString();
    }

    private static String sha256(String input) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest) hex.append(String.format("%02x", b & 0xff));
            return hex.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is required by Java", ex);
        }
    }
}
