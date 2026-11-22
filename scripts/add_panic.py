#!/usr/bin/env python3
"""Apply session-only Panic to Syrex 1.21.11, without modifying KillAura."""
from pathlib import Path
from hashlib import sha256
import sys
from textwrap import dedent
root = Path(sys.argv[1])
java = root / "src/main/java"
assert (java / "syrux/client/SyruxClient.java").is_file(), "Wrong Syrex source root"
combat = {str(p.relative_to(java)): sha256(p.read_bytes()).hexdigest()
          for p in (java/"syrux/client/module/combat").glob("*.java")}

def add(name, source):
    f = java / name
    f.parent.mkdir(parents=True,exist_ok=True)
    f.write_text(dedent(source).lstrip(),encoding="utf8")

def patch(name, old, new):
    f = java / name
    s = f.read_text(encoding="utf8")
    assert s.count(old) == 1, f"Expected exactly one match in {name} for {old[:40]!r}, got {s.count(old)}"
    f.write_text(s.replace(old,new),encoding="utf8")

add("syrux/client/PanicMode.java", """
    package syrux.client;

    import syrux.client.module.Module;
    import syrux.client.module.ModuleManager;
    import syrux.client.module.misc.PanicModule;
    import syrux.client.storage.ConfigStore;
    import syrux.client.ui.ClickGuiScreen;
    import syrux.client.ui.MainMenuScreen;
    import syrux.client.ui.WelcomeScreen;
    import net.minecraft.client.MinecraftClient;
    import net.minecraft.client.gui.screen.Screen;
    import net.minecraft.client.gui.screen.TitleScreen;

    /** Temporary only; does not alter the actual mod file or conceal it on disk. */
    public final class PanicMode {
        private static volatile boolean active;
        private PanicMode() {}
        public static boolean isActive() { return active; }

        public static void activate() {
            if (active) return;
            ConfigStore.saveActiveConfig();
            active = true;
            for (Module module : java.util.List.copyOf(ModuleManager.getModules())) {
                if (module.isEnabled() && !(module instanceof PanicModule)) {
                    try {
                        module.setEnabled(false);
                    } catch (Throwable t) {
                        SyruxClient.logger().warn("Panic: failed to disable {}", module.name, t);
                    }
                }
            }
            MinecraftClient client = MinecraftClient.getInstance();
            if (client != null && client.getWindow() != null) {
                client.getWindow().setTitle("Minecraft 1.21.11");
            }
            hideClientScreen(client);
        }

        public static void hideClientScreen(MinecraftClient client) {
            if (!active || client == null) return;
            Screen screen = client.currentScreen;
            if (screen == null) return;
            if (screen instanceof ClickGuiScreen || screen instanceof MainMenuScreen ||
                screen instanceof WelcomeScreen ||
                screen.getClass().getName().startsWith("syrux.client.auth.Syrex") ||
                screen.getClass().getName().startsWith("syrux.client.ui.")) {
                client.setScreen(client.world == null ? new TitleScreen() : null);
            }
        }
    }
""")

add("syrux/client/module/misc/PanicModule.java", """
    package syrux.client.module.misc;

    import syrux.client.PanicMode;
    import syrux.client.module.Module;
    import syrux.client.module.ModuleCategory;
    import syrux.client.module.ModuleInfo;

    @ModuleInfo(name = "Panic", description = "Скрыть Syrex до перезапуска Minecraft (F10).",
                category = ModuleCategory.MISC)
    public final class PanicModule extends Module {
        private static PanicModule instance;
        private PanicModule() {
            super();
            withKeyCode(299);
        }
        public static PanicModule getInstance() {
            if (instance == null) instance = new PanicModule();
            return instance;
        }
        @Override protected void onEnable() { PanicMode.activate(); }
        @Override protected void onDisable() {
            if (PanicMode.isActive()) setEnabledFlag(true);
        }
    }
""")

add("syrux/client/command/PanicCommand.java", """
    package syrux.client.command;

    import syrux.client.PanicMode;
    /** One-way until restart. */
    public final class PanicCommand implements ClientCommand {
        @Override public String getName() { return "panic"; }
        @Override public String getDescription() { return "Отключить Syrex до перезапуска Minecraft"; }
        @Override public void execute(String[] args) { PanicMode.activate(); }
    }
""")

patch("syrux/client/module/ModuleManager.java",
      "         registerModule(DiscordRPCModule.method3302());",
      "         registerModule(DiscordRPCModule.method3302());\n         registerModule(syrux.client.module.misc.PanicModule.getInstance());")
patch("syrux/client/module/Module.java",
      "   public void setEnabled(boolean newEnabled) {\n",
      "   public void setEnabled(boolean newEnabled) {\n      if (syrux.client.PanicMode.isActive() && newEnabled) return;\n")
patch("syrux/client/module/Module.java",
      "   public void setEnabledWithoutCallbacks(boolean newEnabled) {\n",
      "   public void setEnabledWithoutCallbacks(boolean newEnabled) {\n      if (syrux.client.PanicMode.isActive() && newEnabled) return;\n")
patch("syrux/client/event/EventBus.java",
      "   public void post(T local1805_1) {\n",
      "   public void post(T local1805_1) {\n      if (syrux.client.PanicMode.isActive()) return;\n")
patch("syrux/mixin/KeyboardMixin.java",
      "      if (local8361_1 == MinecraftClient.getInstance().getWindow().getHandle()",
      "      if (syrux.client.PanicMode.isActive()) return;\n      if (local8361_1 == MinecraftClient.getInstance().getWindow().getHandle()")
patch("syrux/client/SyruxClient.java",
      "         while (this.openGuiKey.wasPressed()) {\n",
      "         while (this.openGuiKey.wasPressed()) {\n            if (PanicMode.isActive()) continue;\n")
patch("syrux/client/SyruxClient.java",
      "            if (minecraftClient2.currentScreen instanceof MainMenuScreen) {\n",
      "            if (!PanicMode.isActive() && minecraftClient2.currentScreen instanceof MainMenuScreen) {\n")
patch("syrux/client/SyruxClient.java",
      "      ClientTickEvents.END_CLIENT_TICK.register((EndTick)minecraftClient2 -> {\n         if (EventBus.getInstance().hasListeners(ClientTickEvent.class)) {",
      "      ClientTickEvents.END_CLIENT_TICK.register((EndTick)minecraftClient2 -> {\n         if (PanicMode.isActive()) {\n            PanicMode.hideClientScreen(minecraftClient2);\n            return;\n         }\n         if (EventBus.getInstance().hasListeners(ClientTickEvent.class)) {")
patch("syrux/client/SyruxClient.java",
      "   public void unload() {\n      ConfigStore.saveActiveConfig();",
      "   public void unload() {\n      if (!PanicMode.isActive()) ConfigStore.saveActiveConfig();")
patch("syrux/client/SyruxClient.java",
      "         if (this.loaded) {\n            ConfigStore.saveActiveConfig();",
      "         if (this.loaded && !PanicMode.isActive()) {\n            ConfigStore.saveActiveConfig();")
patch("syrux/client/SyruxClient.java",
      "      local6629_1.add(new PartyCommand());",
      "      local6629_1.add(new PartyCommand());\n      local6629_1.add(new syrux.client.command.PanicCommand());")
patch("syrux/client/storage/ConfigStore.java",
      "            if (module != null && module != AutoDeliverModule.method3798() && asJsonObject.get(local4345_3).isJsonObject()) {",
      "            if (module != null && !(module instanceof syrux.client.module.misc.PanicModule)\n               && module != AutoDeliverModule.method3798() && asJsonObject.get(local4345_3).isJsonObject()) {")
patch("syrux/client/storage/ConfigStore.java",
      "         if (module != AutoDeliverModule.method3798()) {\n",
      "         if (module != AutoDeliverModule.method3798()\n            && !(module instanceof syrux.client.module.misc.PanicModule)) {\n")
patch("syrux/client/storage/ConfigStore.java",
      "   public static void saveActiveConfig() {\n      save(activeConfig);",
      "   public static void saveActiveConfig() {\n      if (syrux.client.PanicMode.isActive()) return;\n      save(activeConfig);")
patch("syrux/client/storage/ConfigStore.java",
      "   public static void autosave() {\n",
      "   public static void autosave() {\n      if (syrux.client.PanicMode.isActive()) return;\n")
patch("syrux/client/storage/ConfigStore.java",
      "   public static boolean save(String local4377_0) {\n",
      "   public static boolean save(String local4377_0) {\n      if (syrux.client.PanicMode.isActive()) return false;\n")
patch("syrux/mixin/MinecraftClientMixin.java",
      "   private Screen replaceTitleScreen(Screen screen) {\n",
      "   private Screen replaceTitleScreen(Screen screen) {\n      if (syrux.client.PanicMode.isActive()) return screen;\n")
patch("syrux/mixin/MinecraftClientMixin.java",
      "   private Screen replaceQuitWorldTitleScreen(Screen screen) {\n",
      "   private Screen replaceQuitWorldTitleScreen(Screen screen) {\n      if (syrux.client.PanicMode.isActive()) return screen;\n")
patch("syrux/mixin/InGameHudMixin.java",
      "   private void renderBelowHud(DrawContext drawContext, RenderTickCounter renderTickCounter, CallbackInfo callbackInfo) {\n",
      "   private void renderBelowHud(DrawContext drawContext, RenderTickCounter renderTickCounter, CallbackInfo callbackInfo) {\n      if (syrux.client.PanicMode.isActive()) return;\n")
patch("syrux/mixin/InGameHudMixin.java",
      "   private void renderHud(DrawContext drawContext, RenderTickCounter renderTickCounter, CallbackInfo callbackInfo) {\n",
      "   private void renderHud(DrawContext drawContext, RenderTickCounter renderTickCounter, CallbackInfo callbackInfo) {\n      if (syrux.client.PanicMode.isActive()) return;\n")
patch("syrux/mixin/InGameHudMixin2.java",
      "   private void renderSaturationBar(DrawContext drawContext, PlayerEntity playerEntity, int local8281_3, int local8281_4, CallbackInfo callbackInfo) {\n",
      "   private void renderSaturationBar(DrawContext drawContext, PlayerEntity playerEntity, int local8281_3, int local8281_4, CallbackInfo callbackInfo) {\n      if (syrux.client.PanicMode.isActive()) return;\n")
patch("syrux/mixin/ChatScreenMixin.java",
      "   private void dispatchClientCommand(String local8106_1, boolean local8106_2, CallbackInfo callbackInfo) {\n",
      "   private void dispatchClientCommand(String local8106_1, boolean local8106_2, CallbackInfo callbackInfo) {\n      if (syrux.client.PanicMode.isActive() && local8106_1.startsWith(\".\")) {\n         callbackInfo.cancel();\n         return;\n      }\n")
patch("syrux/mixin/ChatScreenMixin.java",
      "   private void sendIrcMessage(String local8107_1, boolean local8107_2, CallbackInfo callbackInfo) {\n",
      "   private void sendIrcMessage(String local8107_1, boolean local8107_2, CallbackInfo callbackInfo) {\n      if (syrux.client.PanicMode.isActive()) return;\n")
patch("syrux/client/util/SoundPlayer.java",
      "   public static void method3158(String local5083_0) {\n",
      "   public static void method3158(String local5083_0) {\n      if (syrux.client.PanicMode.isActive()) return;\n")
patch("syrux/client/cosmetic/CosmeticFeatureRenderer.java",
      "      if (!playerEntityRenderState.spectator && (isLocal(playerEntityRenderState) || GlobalsModule.method0643().method0639())) {",
      "      if (!syrux.client.PanicMode.isActive() && !playerEntityRenderState.spectator && (isLocal(playerEntityRenderState) || GlobalsModule.method0643().method0639())) {")
patch("syrux/client/cosmetic/CosmeticRenderDispatcher.java",
      "            (AfterEntities)worldRenderContext -> {\n",
      "            (AfterEntities)worldRenderContext -> {\n               if (syrux.client.PanicMode.isActive()) return;\n")
patch("syrux/client/WindowAppearance.java",
      '      return "Syrex 3.7 - 1.21.11";',
      '      return syrux.client.PanicMode.isActive() ? "Minecraft 1.21.11" : "Syrex 3.7 - 1.21.11";')
patch("syrux/mixin/ChatInputSuggestorMixin.java",
      "   private void suggestClientCommands(CallbackInfo callbackInfo) {\n",
      "   private void suggestClientCommands(CallbackInfo callbackInfo) {\n      if (syrux.client.PanicMode.isActive()) return;\n")
patch("syrux/mixin/ChatScreenMixin.java",
      "         this.client.inGameHud.getChatHud().addToMessageHistory(local8106_1);",
      "         if (!syrux.client.PanicMode.isActive()) this.client.inGameHud.getChatHud().addToMessageHistory(local8106_1);")
assert combat == {str(p.relative_to(java)):sha256(p.read_bytes()).hexdigest()
                  for p in (java/"syrux/client/module/combat").glob("*.java")}
print("Panic installed. Combat sources preserved:",len(combat))
