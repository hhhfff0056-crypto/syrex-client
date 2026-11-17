package com.syrex.auth;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.util.FormattedCharSequence;

import java.io.IOException;
import java.util.Arrays;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * In-game Syrex login form for Minecraft 1.21.11 (Mojang-mapped names).
 *
 * Add to the actual Minecraft client's source tree and open it using:
 * Minecraft.getInstance().setScreen(new SyrexLoginScreen(...));
 *
 * Requires SyrexAccountClient and Gson. The host client must supply its
 * existing local HWID provider and handle a successful LoginResult.
 */
public final class SyrexLoginScreen extends Screen {
    private final Screen parent;
    private final SyrexAccountClient api;
    private final Supplier<String> localDeviceIdentifier;
    private final Consumer<SyrexAccountClient.LoginResult> onAuthenticated;

    private EditBox emailField;
    private EditBox passwordField;
    private Button signInButton;
    private volatile boolean busy;
    private String status = "Enter your Syrex site account to sign in.";
    private boolean errorStatus;

    public SyrexLoginScreen(
            Screen parent,
            SyrexAccountClient api,
            Supplier<String> localDeviceIdentifier,
            Consumer<SyrexAccountClient.LoginResult> onAuthenticated
    ) {
        super(Component.literal("Syrex account"));
        this.parent = parent;
        this.api = Objects.requireNonNull(api, "api");
        this.localDeviceIdentifier = Objects.requireNonNull(localDeviceIdentifier, "device provider");
        this.onAuthenticated = Objects.requireNonNull(onAuthenticated, "login handler");
    }

    @Override
    protected void init() {
        int x = width / 2 - 110;
        int y = height / 2 - 64;

        emailField = new EditBox(font, x, y, 220, 20, Component.literal("Email"));
        emailField.setMaxLength(254);
        emailField.setHint(Component.literal("Email from syrex-client site"));
        addRenderableWidget(emailField);

        passwordField = new EditBox(font, x, y + 31, 220, 20, Component.literal("Password"));
        passwordField.setMaxLength(128);
        passwordField.setHint(Component.literal("Password"));
        // Minecraft 1.21.11: mask the rendered text while keeping the actual
        // field value available to the authentication call.
        passwordField.addFormatter((value, index) ->
            FormattedCharSequence.forward("*".repeat(value.length()), Style.EMPTY));
        addRenderableWidget(passwordField);

        signInButton = addRenderableWidget(Button.builder(
            Component.literal("Sign in & bind this PC"),
            button -> beginLogin()
        ).bounds(x, y + 106, 220, 20).build());

        addRenderableWidget(Button.builder(
            Component.literal("Back"),
            button -> onClose()
        ).bounds(x, y + 134, 220, 20).build());

        setInitialFocus(emailField);
        updateButton();
    }

    private void updateButton() {
        if (signInButton != null) signInButton.active = !busy;
    }

    private void beginLogin() {
        if (busy) return;
        String email = emailField.getValue().trim();
        char[] password = passwordField.getValue().toCharArray();
        passwordField.setValue("");
        if (email.isBlank() || password.length == 0) {
            Arrays.fill(password, '\0');
            status = "Enter email and password.";
            errorStatus = true;
            return;
        }

        busy = true;
        errorStatus = false;
        status = "Signing in...";
        updateButton();

        // Never block Minecraft's render/game loop while contacting Supabase.
        CompletableFuture.runAsync(() -> {
            try {
                String deviceId = localDeviceIdentifier.get();
                SyrexAccountClient.LoginResult result =
                    api.loginAndBind(email, password, deviceId);
                if (minecraft != null) minecraft.execute(() -> {
                    if (minecraft.screen != this) return;
                    busy = false;
                    status = "Welcome! UID: " + result.uid()
                        + " — " + result.edition();
                    errorStatus = false;
                    onAuthenticated.accept(result);
                });
            } catch (IOException | InterruptedException | RuntimeException ex) {
                if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
                String message = ex.getMessage();
                if (message == null || message.isBlank()) message = "Connection failed";
                // No email, password, token or device ID is ever logged.
                String safe = message.length() > 120 ? message.substring(0, 120) : message;
                if (minecraft != null) minecraft.execute(() -> {
                    if (minecraft.screen != this) return;
                    busy = false;
                    status = safe;
                    errorStatus = true;
                    updateButton();
                });
            } finally {
                Arrays.fill(password, '\0');
            }
        });
    }

    @Override
    public void render(GuiGraphics graphics, int mouseX, int mouseY, float delta) {
        super.render(graphics, mouseX, mouseY, delta);
        graphics.drawCenteredString(font, "SYREX CLIENT", width / 2, height / 2 - 95, 0xFFFFFF);
        graphics.drawCenteredString(font,
            "The same account you registered on the website",
            width / 2, height / 2 - 80, 0xBFC1C8);
        graphics.drawCenteredString(font, "Signing in binds this PC to your account", width / 2, height / 2 - 5, 0xD9D9D9);
        graphics.drawCenteredString(font, "Another PC requires HWID reset", width / 2, height / 2 + 8, 0xD9D9D9);
        graphics.drawCenteredString(font, "Only hashed HWID is sent", width / 2, height / 2 + 21, 0xA0A0A0);
        graphics.drawCenteredString(font, status, width / 2, height / 2 + 105,
            errorStatus ? 0xFF6B6B : 0xBFC1C8);
    }

    @Override
    public void onClose() {
        if (!busy && minecraft != null) minecraft.setScreen(parent);
    }
}
