package syrux.client.module.render;

import net.minecraft.client.render.RenderLayers;
import net.minecraft.client.render.VertexConsumer;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.item.Items;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;
import syrux.client.event.EventListener;
import syrux.client.event.WorldRenderEvent;
import syrux.client.module.Module;
import syrux.client.module.ModuleCategory;
import syrux.client.module.ModuleInfo;
import syrux.client.ui.UiTheme;

/** Wind-charge landing prediction: one large theme-colored circle and one small landing circle. */
@ModuleInfo(name = "Wind Predict", category = ModuleCategory.RENDER,
    description = "Большой круг с маленьким кругом в точке приземления после заряда ветра")
public final class WindPredictModule extends Module {
    private static final double OUTER_RADIUS = 2.70;
    private static final double LANDING_RADIUS = 0.36;
    private static final int MAX_PREDICTION_TICKS = 90;
    private static WindPredictModule instance;

    private Vec3d smoothLanding;
    private long lastHeldChargeMs;

    public static WindPredictModule getInstance() {
        if (instance == null) instance = new WindPredictModule();
        return instance;
    }

    private WindPredictModule() { super(); }

    private final EventListener<WorldRenderEvent> render = event -> {
        if (!isEnabled() || mc.player == null || mc.world == null || mc.currentScreen != null) return;

        long now = System.currentTimeMillis();
        boolean windCharge = ((net.minecraft.entity.LivingEntity) mc.player).getMainHandStack().isOf(Items.WIND_CHARGE)
            || ((net.minecraft.entity.LivingEntity) mc.player).getOffHandStack().isOf(Items.WIND_CHARGE);
        if (windCharge) lastHeldChargeMs = now;

        // The displayed point is a prediction after the charge has applied its impulse.
        if (now - lastHeldChargeMs > 3500L || ((net.minecraft.entity.Entity) mc.player).isOnGround()
            || ((net.minecraft.entity.Entity) mc.player).isTouchingWater()
            || ((net.minecraft.entity.LivingEntity) mc.player).isClimbing()) {
            smoothLanding = null;
            return;
        }

        Vec3d start = ((net.minecraft.entity.Entity) mc.player).getEntityPos();
        Vec3d velocity = ((net.minecraft.entity.Entity) mc.player).getVelocity();
        if (velocity.lengthSquared() < 1.0E-4) return;

        Box initial = ((net.minecraft.entity.Entity) mc.player).getBoundingBox();
        Vec3d pos = start;
        Vec3d landing = null;
        for (int tick = 0; tick < MAX_PREDICTION_TICKS; tick++) {
            Vec3d next = pos.add(velocity);
            if (!((net.minecraft.world.CollisionView) mc.world).isSpaceEmpty(mc.player, initial.offset(next.subtract(start)))) {
                // Resolve first contact to sub-block precision. The centre is the landing feet position.
                Vec3d clear = pos, blocked = next;
                for (int i = 0; i < 8; i++) {
                    Vec3d mid = clear.lerp(blocked, 0.5);
                    if (((net.minecraft.world.CollisionView) mc.world).isSpaceEmpty(mc.player, initial.offset(mid.subtract(start)))) {
                        clear = mid;
                    } else {
                        blocked = mid;
                    }
                }
                if (velocity.y <= 0.0) {
                    landing = clear;
                    break;
                }
                // Ceiling/wall during ascent is not the ground. Stop horizontal prediction and fall.
                pos = clear;
                velocity = new Vec3d(0, -0.08, 0);
                continue;
            }
            pos = next;
            if (pos.y < ((net.minecraft.world.HeightLimitView) mc.world).getBottomY()) break;
            velocity = new Vec3d(velocity.x * 0.91, (velocity.y - 0.08) * 0.98, velocity.z * 0.91);
        }
        if (landing == null) {
            smoothLanding = null;
            return;
        }
        smoothLanding = smoothLanding == null || smoothLanding.squaredDistanceTo(landing) > 25.0
            ? landing : smoothLanding.lerp(landing, 0.27);

        Vec3d camera = ((net.minecraft.world.waypoint.TrackedWaypoint.YawProvider) mc.gameRenderer.getCamera()).getCameraPos();
        Vec3d center = smoothLanding.subtract(camera).add(0.0, 0.055, 0.0);
        MatrixStack matrices = event.method0647();
        VertexConsumer pen = ((net.minecraft.client.render.VertexConsumerProvider)
            mc.getBufferBuilders().getEntityVertexConsumers()).getBuffer(RenderLayers.lines());

        // Exactly two visible markers: glowing outer circumference, small centred landing ring.
        // The accent is read every frame so a live Syrex theme change immediately recolors both.
        int accent = UiTheme.field09686;
        drawRing(pen, matrices, center, OUTER_RADIUS - 0.045, withAlpha(accent, 24), 6.0f);
        drawRing(pen, matrices, center, OUTER_RADIUS + 0.045, withAlpha(accent, 40), 5.5f);
        drawRing(pen, matrices, center, OUTER_RADIUS, withAlpha(accent, 245), 2.8f);
        drawRing(pen, matrices, center.add(0.0, 0.009, 0.0), LANDING_RADIUS, withAlpha(accent, 255), 2.4f);
        mc.getBufferBuilders().getEntityVertexConsumers().draw();
    };

    private static int withAlpha(int argb, int alpha) {
        return (alpha << 24) | (argb & 0x00FFFFFF);
    }

    private static void drawRing(VertexConsumer out, MatrixStack matrices, Vec3d center,
                                 double radius, int color, float width) {
        final int segments = 96;
        for (int i = 0; i < segments; i++) {
            double a = i * Math.PI * 2 / segments;
            double b = (i + 1) * Math.PI * 2 / segments;
            Vec3d from = center.add(Math.cos(a) * radius, 0, Math.sin(a) * radius);
            Vec3d to = center.add(Math.cos(b) * radius, 0, Math.sin(b) * radius);
            Vec3d direction = to.subtract(from).normalize();
            out.vertex(matrices.peek(), (float) from.x, (float) from.y, (float) from.z)
                .color(color).normal(matrices.peek(), (float) direction.x, (float) direction.y, (float) direction.z)
                .lineWidth(width);
            out.vertex(matrices.peek(), (float) to.x, (float) to.y, (float) to.z)
                .color(color).normal(matrices.peek(), (float) direction.x, (float) direction.y, (float) direction.z)
                .lineWidth(width);
        }
    }

    @Override
    protected void onDisable() {
        smoothLanding = null;
        lastHeldChargeMs = 0L;
    }
}
