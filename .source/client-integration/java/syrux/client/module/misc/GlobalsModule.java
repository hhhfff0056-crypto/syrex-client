package syrux.client.module.misc;

import net.minecraft.client.network.AbstractClientPlayerEntity;
import syrux.client.cosmetic.CosmeticCategory;
import syrux.client.cosmetic.CosmeticEntry;
import syrux.client.cosmetic.CosmeticsApi;
import syrux.client.event.ClientTickEvent;
import syrux.client.event.EventListener;
import syrux.client.module.Module;
import syrux.client.module.ModuleCategory;
import syrux.client.module.ModuleInfo;
import syrux.client.setting.BooleanSetting;
import syrux.client.setting.KeybindSetting;
import syrux.client.setting.ModeSetting;
import syrux.client.storage.FriendStore;
import syrux.client.ui.SyruxCosmeticsScreen;

/**
 * Globals now uses Syrex website cosmetics instead of a third-party sync API.
 * The cloud service stores equipped IDs per confirmed Minecraft UUID.
 * No player IP, server address, live presence, friend list or raw hardware IDs
 * are sent by this module. Cloud saving/prefetching lives in CosmeticsApi.
 */
@ModuleInfo(
    name = "Globals",
    description = "Косметика с сайта Syrex для других игроков с клиентом.",
    category = ModuleCategory.MISC
)
public final class GlobalsModule extends Module {
    private static GlobalsModule instance;
    public BooleanSetting booleanSetting;
    public ModeSetting modeSetting;
    public KeybindSetting keybindSetting;
    private boolean wasPressed;

    public final EventListener<ClientTickEvent> field00903 = event -> {
        if (!event.isPre() || mc == null) return;
        boolean pressed = keybindSetting.getBinding().method2749(mc.getWindow().getHandle());
        if (pressed && !wasPressed && mc.currentScreen == null && mc.player != null) {
            mc.setScreen(new SyruxCosmeticsScreen());
        }
        wasPressed = pressed;
    };

    private GlobalsModule() {
        booleanSetting = this.addSetting(new BooleanSetting(
            "Синхронизация моделей",
            "Загружает косметику игроков с сайта Syrex, без старого внешнего сервера.",
            true
        ));
        modeSetting = this.addSetting(new ModeSetting(
            "С кем",
            "Кого показывать локально: друзей или всех пользователей Syrex. " +
                "Выбранная косметика сохраняется на сайте и доступна другим клиентам Syrex.",
            "Все с Globals",
            "Только друзья",
            "Все с Globals"
        ));
        modeSetting.withVisibility(() -> booleanSetting.isChecked());
        keybindSetting = this.addSetting(new KeybindSetting(
            "Меню косметики", "Открывает меню косметики прямо в игре."
        ));
    }

    @Override
    protected void onEnable() {
        CosmeticsApi.getInstance().forceAccountRefresh().exceptionally(error -> null);
    }

    public boolean method0639() {
        return booleanSetting.isChecked() && mc != null && mc.world != null;
    }

    /**
     * Legacy name-based rendering API resolves the player's in-world UUID and
     * uses the Syrex cosmetics cache (never an external nickname API).
     */
    public CosmeticEntry method0641(String username, CosmeticCategory category) {
        if (!booleanSetting.isChecked() || username == null || category == null
                || mc == null || mc.world == null) return null;
        if (modeSetting.isSelected("Только друзья") && !FriendStore.method3431(username)) {
            return null;
        }
        for (AbstractClientPlayerEntity player : mc.world.getPlayers()) {
            if (player != mc.player && player.getGameProfile().name().equalsIgnoreCase(username)) {
                return CosmeticsApi.getInstance().getEquipped(player.getUuid(), category);
            }
        }
        return null;
    }

    public static GlobalsModule method0643() {
        if (instance == null) instance = new GlobalsModule();
        return instance;
    }
}
