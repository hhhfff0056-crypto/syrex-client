package syrux.client.auth;

import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ServerInfo;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;

/**
 * Syrex website in-game heartbeat. No player IP, world coordinates or local
 * server IP is ever submitted. Public server DNS is displayed only if the
 * player explicitly switches on "Показывать Minecraft-сервер" on the website.
 *
 * Yarn 1.21.11 source. Runtime JAR must use remapped intermediary symbols.
 */
public final class SyrexGamePresence {
    private static final String URL =
        "https://schhzjmsgdjicoiadoqx.supabase.co/functions/v1/syrex-game-presence";
    private static final String PUBLIC_KEY = "sb_publishable_ege-vbqEyqsq6HRn7DXtBQ_MQ8Op1UH";
    private static final HttpClient HTTP = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(6)).build();
    private static final Pattern HOST = Pattern.compile(
        "(?i)^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::[0-9]{1,5})?$");
    private static String lastState = "off";
    private static String lastToken;
    private static long nextHeartbeat;

    private SyrexGamePresence() { }

    /** Register with ClientTickEvents.END_CLIENT_TICK.register(SyrexGamePresence::tick). */
    public static void tick(MinecraftClient mc) {
        SyrexAuthService.Session account = SyrexAuthService.current();
        String token = account == null ? null : account.accessToken();
        boolean playing = token != null && mc.world != null && mc.player != null && !mc.isInSingleplayer();
        ServerInfo server = playing ? mc.getCurrentServerEntry() : null;
        String host = server == null ? null : publicHost(server.address);
        String status = playing ? "game:" + (host == null ? "" : host) : "off";
        long now = System.currentTimeMillis();

        if (!status.equals(lastState) || !Objects.equals(token, lastToken)) {
            String old = lastToken;
            boolean oldPlaying = lastState.startsWith("game:");
            lastState = status;
            lastToken = token;
            nextHeartbeat = 0L;
            if (oldPlaying && (status.equals("off") || !Objects.equals(old, token)) && old != null)
                send(old, "leave", null);
        }
        if (playing && now >= nextHeartbeat) {
            nextHeartbeat = now + 60000L;
            send(token, "heartbeat", host);
        }
    }

    private static String publicHost(String raw) {
        if (raw == null || raw.length() > 125) return null;
        String host = raw.trim().toLowerCase(Locale.ROOT);
        if (!HOST.matcher(host).matches()) return null;
        String name = host.replaceFirst(":\\d{1,5}$", "");
        String tld = name.substring(name.lastIndexOf('.') + 1);
        if (!tld.matches("[a-z]{2,24}") ||
            name.endsWith(".local") || name.endsWith(".lan") ||
            name.endsWith(".internal") || name.endsWith(".home") ||
            name.endsWith(".localhost") || name.endsWith(".test") ||
            name.endsWith(".invalid")) return null;
        if (host.contains(":")) {
            int port = Integer.parseInt(host.substring(host.lastIndexOf(':') + 1));
            if (port < 1 || port > 65535) return null;
        }
        return host;
    }

    private static void send(String token, String action, String host) {
        CompletableFuture.runAsync(() -> {
            try {
                JsonObject payload = new JsonObject();
                payload.addProperty("action", action);
                if (host == null) payload.add("server", JsonNull.INSTANCE);
                else payload.addProperty("server", host);
                HttpRequest req = HttpRequest.newBuilder(URI.create(URL))
                    .timeout(Duration.ofSeconds(12))
                    .header("apikey", PUBLIC_KEY)
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload.toString(), StandardCharsets.UTF_8))
                    .build();
                HTTP.send(req, HttpResponse.BodyHandlers.discarding());
            } catch (Exception ignored) {
                // Best effort: intermittent connectivity must not stop gameplay.
            }
        });
    }
}
