package syrux.client.module.render;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.Identifier;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import syrux.client.auth.SyrexAuthService;
import syrux.client.event.ClientTickEvent;
import syrux.client.event.EventListener;
import syrux.client.event.WorldRenderEvent;
import syrux.client.module.Module;
import syrux.client.module.ModuleCategory;
import syrux.client.module.ModuleInfo;
import syrux.client.setting.BooleanSetting;
import syrux.client.setting.KeybindSetting;
import syrux.client.util.ClientChat;
import syrux.client.util.InputBinding;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Opt-in Syrex friend waypoint pings. The keybind sends a location ONLY when
 * clicked, only to mutually accepted friends currently on the same public
 * Minecraft server. Visual markers expire after 120 seconds.
 *
 * The client obtains auth from SyrexAuthService and never sends credentials
 * other than its short-lived Supabase access token. Not server-authoritative.
 */
@ModuleInfo(name = "Friend Pings", description = "Анимированные PNG-метки для друзей Syrex по клавише", category = ModuleCategory.RENDER)
public final class FriendPingsModule extends Module {
    private static final String API = "https://schhzjmsgdjicoiadoqx.supabase.co/functions/v1/syrex-social";
    private static final String KEY = "sb_publishable_ege-vbqEyqsq6HRn7DXtBQ_MQ8Op1UH";
    private static final Identifier ICON = Identifier.of("syrux", "textures/gui/friend_waypoint.png");
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static FriendPingsModule instance;

    private final KeybindSetting pingKey = addSetting(new KeybindSetting(
        "Метка друзьям", "Отправить метку друзьям на том же сервере. По умолчанию P.",
        InputBinding.keyboardKey(80)));
    private final BooleanSetting showRing = addSetting(new BooleanSetting(
        "Анимированный круг", "Золотистые кольца вокруг PNG-метки", true));
    private final BooleanSetting showIcon = addSetting(new BooleanSetting(
        "PNG-иконка", "Показывать жёлтый значок в точке метки", true));

    private final Map<Long, Ping> pings = new ConcurrentHashMap<>();
    private final AtomicBoolean requesting = new AtomicBoolean(false);
    private volatile long lastSeenId;
    private volatile long nextPollAt;
    private volatile String currentScope = "";
    private volatile String lastToken = "";
    private boolean keyWasHeld;

    public static FriendPingsModule getInstance() {
        if (instance == null) instance = new FriendPingsModule();
        return instance;
    }
    private FriendPingsModule() { super(); }

    private final EventListener<ClientTickEvent> tick = event -> {
        if (!event.isPre() || mc == null || mc.world == null || mc.player == null) {
            keyWasHeld = false;
            return;
        }
        SyrexAuthService.Session session = SyrexAuthService.current();
        String host = publicHost(mc.getCurrentServerEntry() == null ? null : mc.getCurrentServerEntry().address);
        String dimension = mc.world.getRegistryKey().getValue().toString();
        String token = session == null ? null : session.accessToken();
        String scope = host == null || mc.isInSingleplayer() ? "" : host + "|" + dimension;
        if (!Objects.equals(currentScope, scope) || !Objects.equals(lastToken, token)) {
            currentScope = scope;
            lastToken = token;
            pings.clear(); lastSeenId = 0; nextPollAt = 0;
        }
        boolean pressed = pingKey.getBinding().method2749(mc.getWindow().getHandle());
        if (pressed && !keyWasHeld && mc.currentScreen == null) {
            if (token == null || scope.isEmpty()) {
                chat("Для меток войди в Syrex и подключись к публичному серверу.");
            } else {
                BlockPos at = mc.player.getBlockPos();
                HitResult hit = mc.crosshairTarget;
                if (hit instanceof BlockHitResult block && hit.getType() == HitResult.Type.BLOCK) {
                    at = block.getBlockPos();
                }
                sendPing(token, host, dimension, at);
            }
        }
        keyWasHeld = pressed;
        long now = System.currentTimeMillis();
        pings.values().removeIf(p -> p.expiresAt <= now);
        if (token != null && !scope.isEmpty() && now >= nextPollAt && requesting.compareAndSet(false, true)) {
            nextPollAt = now + 7500L;
            poll(token, host, dimension);
        }
    };

    private final EventListener<WorldRenderEvent> render = event -> {
        if (mc == null || mc.world == null || mc.player == null || pings.isEmpty()) return;
        final Vec3d camera = mc.gameRenderer.getCamera().getCameraPos();
        final MatrixStack matrices = event.method0647();
        final var buffers = mc.getBufferBuilders().getEntityVertexConsumers();
        final long ms = System.currentTimeMillis();
        for (Ping ping : pings.values()) {
            if (ping.expiresAt <= ms) continue;
            Vec3d pos = new Vec3d(ping.x + .5, ping.y + 1.04, ping.z + .5).subtract(camera);
            if (pos.lengthSquared() > 180.0 * 180.0) continue;
            double t = ms * .001;
            double scale = .92 + .08 * Math.sin(t * 4.8);
            if (showRing.isChecked()) {
                VertexConsumer lines = buffers.getBuffer(RenderLayers.lines());
                ring(lines, matrices, pos.add(0, -.95, 0), .70 * scale, 0xEAFFD53D, 2.7f, t * .72);
                ring(lines, matrices, pos.add(0, -.92, 0), .92 * scale, 0x8CFFFFFF, 2.1f, -t * .53);
                segment(lines, matrices, pos.add(0,-.85,0), pos.add(0,.1+.12*Math.sin(t*3.1),0), 0xA8FFE169, 2f);
            }
            if (showIcon.isChecked()) {
                VertexConsumer quad = buffers.getBuffer(RenderLayers.entityTranslucent(ICON));
                double size = .45 * scale;
                double y = pos.y + .05 + .14 * Math.sin(t * 2.6);
                float x = (float)pos.x, z=(float)pos.z, h=(float)y, r=(float)size;
                // PNG lies horizontally above the marked block, with a pulsing
                // height and rings. The glowing asset is transparent RGBA.
                int alpha = (int)(220 + 30*Math.sin(t*3));
                int rgba = ((alpha & 255) << 24) | 0xFFFFFF;
                quad.vertex(matrices.peek(),x-r,h,z-r).color(rgba).texture(0,0).overlay(0).light(0xF000F0).normal(0,1,0);
                quad.vertex(matrices.peek(),x-r,h,z+r).color(rgba).texture(0,1).overlay(0).light(0xF000F0).normal(0,1,0);
                quad.vertex(matrices.peek(),x+r,h,z+r).color(rgba).texture(1,1).overlay(0).light(0xF000F0).normal(0,1,0);
                quad.vertex(matrices.peek(),x+r,h,z-r).color(rgba).texture(1,0).overlay(0).light(0xF000F0).normal(0,1,0);
            }
        }
        buffers.draw();
    };

    @Override protected void onDisable() {
        pings.clear(); nextPollAt=0; keyWasHeld=false;
    }

    private static void chat(String msg) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client != null) client.execute(() -> ClientChat.method2267("&6[Syrex] &f" + msg));
    }

    private static String publicHost(String raw) {
        if (raw == null || raw.length() > 125) return null;
        String host = raw.trim().toLowerCase(java.util.Locale.ROOT);
        if (!host.matches("[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9][a-z0-9-]*)+(?::[0-9]{1,5})?")) return null;
        String domain = host.replaceFirst(":\\d{1,5}$", "");
        String tld = domain.substring(domain.lastIndexOf('.') + 1);
        if (!tld.matches("[a-z]{2,24}") ||
            domain.endsWith(".local") || domain.endsWith(".lan") ||
            domain.endsWith(".internal") || domain.endsWith(".localhost") ||
            domain.endsWith(".home") || domain.endsWith(".test")) return null;
        if (host.indexOf(':') != -1) {
            try { int port = Integer.parseInt(host.substring(host.lastIndexOf(':')+1));
                if (port < 1 || port > 65535) return null; }
            catch (NumberFormatException e) { return null; }
        }
        return host;
    }

    private static JsonObject post(String token, String action, JsonObject arguments) throws Exception {
        JsonObject body = new JsonObject();
        body.addProperty("action", action);
        for (var e : arguments.entrySet()) body.add(e.getKey(), e.getValue());
        HttpRequest req = HttpRequest.newBuilder(URI.create(API))
            .timeout(Duration.ofSeconds(9)).header("apikey",KEY)
            .header("Authorization", "Bearer " + token)
            .header("Content-Type","application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString(),StandardCharsets.UTF_8))
            .build();
        HttpResponse<String> response = HTTP.send(req,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        JsonObject result = JsonParser.parseString(response.body()).getAsJsonObject();
        if (response.statusCode() >= 400) throw new IOException(result.has("error") ? result.get("error").getAsString() : "HTTP " + response.statusCode());
        return result;
    }

    private void sendPing(String token, String host, String dim, BlockPos where) {
        CompletableFuture.runAsync(() -> {
            try {
                JsonObject params = new JsonObject();
                params.addProperty("server",host);
                params.addProperty("dimension",dim);
                params.addProperty("x",where.getX());
                params.addProperty("y",where.getY());
                params.addProperty("z",where.getZ());
                JsonObject reply = post(token,"ping-send",params);
                int delivered = reply.has("sent") ? reply.get("sent").getAsInt() : 0;
                chat(delivered == 0 ? "На сервере нет друзей Syrex, которым можно отправить метку." :
                    "Метка отправлена друзьям: " + delivered);
            } catch (Exception e) { chat("Не удалось отправить метку: " + e.getMessage()); }
        });
    }

    private void poll(String token,String host,String dim) {
        final long since = lastSeenId;
        CompletableFuture.runAsync(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("server",host);
                body.addProperty("dimension",dim);
                body.addProperty("after",since);
                JsonObject result = post(token,"ping-poll",body);
                JsonArray items = result.has("pings") ? result.getAsJsonArray("pings") : new JsonArray();
                if (!Objects.equals(currentScope,host+"|"+dim) || !Objects.equals(lastToken,token)) return;
                for (var item : items) {
                    JsonObject row=item.getAsJsonObject();
                    long id=row.get("id").getAsLong();
                    String name=row.get("nickname").getAsString();
                    int x=row.get("x").getAsInt(),y=row.get("y").getAsInt(),z=row.get("z").getAsInt();
                    long expiresAt=java.time.Instant.parse(row.get("expiresAt").getAsString()).toEpochMilli();
                    lastSeenId=Math.max(lastSeenId,id);
                    if (expiresAt > System.currentTimeMillis() && pings.size() < 40) {
                        pings.put(id,new Ping(x,y,z,name,expiresAt));
                        chat(name + " отправил метку: " + x + ", " + y + ", " + z);
                    }
                }
            } catch (Exception ignored) {
                // Network failure must never block the client thread.
            } finally { requesting.set(false); }
        });
    }

    private static void ring(VertexConsumer vc, MatrixStack m, Vec3d center,
                             double radius, int color, float width, double rotation) {
        for (int i = 0; i < 48; i++) {
            double a = rotation + i * Math.PI / 24, b = rotation + (i+1) * Math.PI / 24;
            Vec3d p = center.add(Math.cos(a)*radius,0,Math.sin(a)*radius);
            Vec3d q = center.add(Math.cos(b)*radius,0,Math.sin(b)*radius);
            segment(vc,m,p,q,color,width);
        }
    }
    private static void segment(VertexConsumer v, MatrixStack m, Vec3d from,Vec3d to,int color,float width) {
        Vec3d delta=to.subtract(from);
        if (delta.lengthSquared() < .0000001) return;
        Vec3d norm=delta.normalize();
        v.vertex(m.peek(),(float)from.x,(float)from.y,(float)from.z).color(color)
            .normal(m.peek(),(float)norm.x,(float)norm.y,(float)norm.z).lineWidth(width);
        v.vertex(m.peek(),(float)to.x,(float)to.y,(float)to.z).color(color)
            .normal(m.peek(),(float)norm.x,(float)norm.y,(float)norm.z).lineWidth(width);
    }

    private record Ping(int x,int y,int z,String nickname,long expiresAt) { }
}
