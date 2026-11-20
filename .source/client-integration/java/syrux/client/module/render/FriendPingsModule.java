package syrux.client.module.render;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.world.World;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.Vec3i;
import net.minecraft.world.waypoint.TrackedWaypoint;
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
import java.util.Locale;
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
@ModuleInfo(name = "Friend Pings", description = "Минималистичные метки с координатами и расстоянием для пати Syrex", category = ModuleCategory.RENDER)
public final class FriendPingsModule extends Module {
    private static final String API = "https://schhzjmsgdjicoiadoqx.supabase.co/functions/v1/syrex-social";
    private static final String KEY = "sb_publishable_ege-vbqEyqsq6HRn7DXtBQ_MQ8Op1UH";
    private static final Identifier ICON = Identifier.of("syrux", "textures/gui/friend_waypoint.png");
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static FriendPingsModule instance;

    private final KeybindSetting pingKey = addSetting(new KeybindSetting(
        "Метка в пати", "Отправить метку участникам .party на том же сервере. По умолчанию P.",
        InputBinding.keyboardKey(80)));
    private final BooleanSetting showRing = addSetting(new BooleanSetting(
        "Тонкое кольцо", "Минималистичное кольцо у метки", true));
    private final BooleanSetting showIcon = addSetting(new BooleanSetting(
        "PNG-иконка", "Маленький жёлтый пин возле координат", true));

    private final Map<Long, Ping> pings = new ConcurrentHashMap<>();
    private final AtomicBoolean requesting = new AtomicBoolean(false);
    private volatile long lastSeenId;
    private volatile long nextPollAt;
    private volatile String currentScope = "";
    private volatile String lastToken = "";
    private boolean keyWasHeld;
    private final AtomicBoolean partyRequesting = new AtomicBoolean(false);
    private volatile long nextPartyPollAt;
    private volatile String seenPartyInvite = "";

    public static FriendPingsModule getInstance() {
        if (instance == null) instance = new FriendPingsModule();
        return instance;
    }
    private FriendPingsModule() { super(); }

    // The existing Syrex CommandDispatcher already captures .party before chat
    // is sent to the Minecraft server; its PartyCommand delegates here.
    public void runPartyArgs(String[] args) {
        String command = ".party";
        if (args != null && args.length > 0) command += " " + String.join(" ", args);
        executePartyCommand(command);
    }

    private final EventListener<ClientTickEvent> tick = event -> {
        if (!event.isPre() || mc == null || mc.world == null || mc.player == null) {
            keyWasHeld = false;
            return;
        }
        SyrexAuthService.Session session = SyrexAuthService.current();
        String host = publicHost(mc.getCurrentServerEntry() == null ? null : mc.getCurrentServerEntry().address);
        String dimension = ((World) mc.world).getRegistryKey().getValue().toString();
        String token = session == null ? null : session.accessToken();
        String scope = host == null || mc.isInSingleplayer() ? "" : host + "|" + dimension;
        if (!Objects.equals(currentScope, scope) || !Objects.equals(lastToken, token)) {
            currentScope = scope;
            lastToken = token;
            pings.clear(); lastSeenId = 0; nextPollAt = 0; nextPartyPollAt = 0; seenPartyInvite = "";
        }
        boolean pressed = pingKey.getBinding().method2749(mc.getWindow().getHandle());
        if (pressed && !keyWasHeld && mc.currentScreen == null) {
            if (token == null || scope.isEmpty()) {
                chat("Для меток войди в Syrex и подключись к публичному серверу.");
            } else {
                Entity self = mc.player;
                BlockPos at = new BlockPos((int)Math.floor(self.getX()),
                    (int)Math.floor(self.getY()), (int)Math.floor(self.getZ()));
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
        if (token != null && now >= nextPartyPollAt && partyRequesting.compareAndSet(false, true)) {
            nextPartyPollAt = now + 30000L;
            pollPartyInvites(token);
        }
    };

    private final EventListener<WorldRenderEvent> render = event -> {
        if (mc == null || mc.world == null || mc.player == null || pings.isEmpty()) return;
        final Vec3d camera = ((TrackedWaypoint.YawProvider)mc.gameRenderer.getCamera()).getCameraPos();
        final MatrixStack matrices = event.method0647();
        final var buffers = mc.getBufferBuilders().getEntityVertexConsumers();
        final long ms = System.currentTimeMillis();
        for (Ping ping : pings.values()) {
            if (ping.expiresAt <= ms) continue;
            Vec3d target = new Vec3d(ping.x + .5, ping.y + 1.05, ping.z + .5);
            Entity self = mc.player;
            double dx=self.getX()-target.x, dy=self.getY()-target.y, dz=self.getZ()-target.z;
            double distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (distance > 360) continue;
            Vec3d ground = target.subtract(camera).add(0, -1.0, 0);
            if (showRing.isChecked()) {
                double pulse = 0.95 + 0.055 * Math.sin(ms * .0025);
                ring(buffers.getBuffer(RenderLayers.lines()), matrices, ground,
                    .38 * pulse, 0xAADDAB26, 1.45f, ms * .00016);
            }

            // Render the label as a camera-facing 3D panel; distance is
            // recomputed every frame, while the coordinates remain fixed.
            Vec3d label = target.subtract(camera).add(0, .66 + .035 * Math.sin(ms * .002), 0);
            float scale = (float)(0.019 + Math.min(distance, 150) * .00012);
            matrices.push();
            matrices.translate(label.x, label.y, label.z);
            matrices.multiply(mc.gameRenderer.getCamera().getRotation());
            matrices.scale(-scale, -scale, scale);

            String title = ping.nickname + "  •  " + Math.round(distance) + "м";
            String coords = "X " + ping.x + "   Y " + ping.y + "   Z " + ping.z;
            TextRenderer textRenderer = mc.textRenderer;
            float lineA = -textRenderer.getWidth(title) / 2.0f;
            float lineB = -textRenderer.getWidth(coords) / 2.0f;
            textRenderer.draw(title, lineA, -39, 0xFFFFD83A, true,
                matrices.peek().getPositionMatrix(), buffers,
                TextRenderer.TextLayerType.SEE_THROUGH, 0x850C0C0C, 0xF000F0);
            textRenderer.draw(coords, lineB, -27, 0xFFEAEAEA, true,
                matrices.peek().getPositionMatrix(), buffers,
                TextRenderer.TextLayerType.SEE_THROUGH, 0x850C0C0C, 0xF000F0);
            if (showIcon.isChecked()) {
                VertexConsumer quad = buffers.getBuffer(RenderLayers.entityTranslucent(ICON));
                // A tiny, minimal PNG instead of the old large ornament.
                float iconSize = 7.5f;
                quad.vertex(matrices.peek(), -iconSize, -17, 0).color(0xFFFFFFFF)
                    .texture(0, 0).overlay(0).light(0xF000F0).normal(0, 0, 1);
                quad.vertex(matrices.peek(), -iconSize, -2, 0).color(0xFFFFFFFF)
                    .texture(0, 1).overlay(0).light(0xF000F0).normal(0, 0, 1);
                quad.vertex(matrices.peek(), iconSize, -2, 0).color(0xFFFFFFFF)
                    .texture(1, 1).overlay(0).light(0xF000F0).normal(0, 0, 1);
                quad.vertex(matrices.peek(), iconSize, -17, 0).color(0xFFFFFFFF)
                    .texture(1, 0).overlay(0).light(0xF000F0).normal(0, 0, 1);
            }
            matrices.pop();
        }
        buffers.draw();
    };

    @Override protected void onDisable() {
        pings.clear(); nextPollAt=0; nextPartyPollAt=0; keyWasHeld=false;
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
                params.addProperty("x",((Vec3i)where).getX());
                params.addProperty("y",((Vec3i)where).getY());
                params.addProperty("z",((Vec3i)where).getZ());
                JsonObject reply = post(token,"ping-send",params);
                int delivered = reply.has("sent") ? reply.get("sent").getAsInt() : 0;
                chat(delivered == 0 ? "Нет участников пати на вашем сервере. Пригласи: .party <ник>" :
                    "Метка отправлена участникам пати: " + delivered);
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

    private void executePartyCommand(String input) {
        String[] parts = input.trim().split("\\s+");
        String mode = parts.length == 1 ? "list" : parts[1].toLowerCase(Locale.ROOT);
        String action;
        JsonObject params = new JsonObject();
        if (parts.length == 1 || mode.equals("list") || mode.equals("info") || mode.equals("status")) {
            action = "party-status";
        } else if (mode.equals("accept")) {
            action = "party-accept";
        } else if (mode.equals("decline") || mode.equals("reject")) {
            action = "party-decline";
        } else if (mode.equals("leave") || mode.equals("disband")) {
            action = "party-leave";
        } else if (mode.equals("kick") && parts.length == 3) {
            action = "party-kick";
            params.addProperty("nickname", parts[2]);
        } else if (parts.length == 2 && mode.matches("[a-z0-9_]{3,32}")) {
            action = "party-invite";
            params.addProperty("nickname", parts[1]);
        } else {
            chat(".party <ник> | accept | decline | list | kick <ник> | leave");
            return;
        }
        SyrexAuthService.Session session = SyrexAuthService.current();
        if (session == null || session.accessToken() == null) {
            chat("Войдите в аккаунт Syrex для работы с пати.");
            return;
        }
        String token = session.accessToken();
        CompletableFuture.runAsync(() -> {
            try {
                JsonObject result = post(token, action, params);
                switch (action) {
                    case "party-status" -> showPartyStatus(result);
                    case "party-invite" -> chat("Приглашение отправлено: " + result.get("invited").getAsString());
                    case "party-accept" -> chat("Вы вступили в пати. Метки доступны по клавише P.");
                    case "party-decline" -> chat("Приглашение отклонено.");
                    case "party-leave" -> chat(result.has("disbanded") ? "Пати распущено." : "Вы вышли из пати.");
                    case "party-kick" -> chat("Игрок удалён из пати.");
                    default -> chat("Пати обновлено.");
                }
                nextPartyPollAt = 0;
            } catch (Exception e) { chat("Пати: " + e.getMessage()); }
        });
    }

    private static void showPartyStatus(JsonObject result) {
        if (result.has("party") && result.get("party").isJsonObject()) {
            JsonObject party = result.getAsJsonObject("party");
            JsonArray members = party.getAsJsonArray("members");
            StringBuilder list = new StringBuilder();
            for (var entry : members) {
                if (list.length() > 0) list.append(", ");
                list.append(entry.getAsJsonObject().get("nickname").getAsString());
            }
            chat("Пати [" + members.size() + "/6]: " + list);
        } else chat("Нет активной пати. Пригласить друга: .party <ник с сайта>");
        JsonArray invitations = result.has("invites") ? result.getAsJsonArray("invites") : new JsonArray();
        if (!invitations.isEmpty()) {
            chat("Приглашение от " + invitations.get(0).getAsJsonObject().get("from").getAsString()
                + ". Вступить: .party accept, отклонить: .party decline");
        }
    }

    private void pollPartyInvites(String token) {
        CompletableFuture.runAsync(() -> {
            try {
                JsonObject result = post(token, "party-status", new JsonObject());
                JsonArray invites = result.has("invites") ? result.getAsJsonArray("invites") : new JsonArray();
                String current = invites.isEmpty() ? "" : invites.get(0).getAsJsonObject().get("from").getAsString();
                if (!current.isEmpty() && !current.equals(seenPartyInvite)) {
                    chat(current + " приглашает в пати! Принять: .party accept");
                }
                seenPartyInvite = current;
            } catch (Exception ignored) {
                // Background polls may fail if the game is offline.
            } finally { partyRequesting.set(false); }
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
