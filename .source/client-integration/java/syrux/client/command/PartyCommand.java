package syrux.client.command;

import java.util.ArrayList;
import java.util.Arrays;
import syrux.client.module.render.FriendPingsModule;

/** Use Syrex's existing dot-command dispatcher for server-backed parties. */
public final class PartyCommand implements ClientCommand {
    @Override public String getName() { return "party"; }
    @Override public String getDescription() {
        return "Syrex пати: .party <ник>, accept, decline, list, leave, kick <ник>";
    }
    @Override public ArrayList<String> suggestArguments(String[] args) {
        return new ArrayList<>(Arrays.asList("accept", "decline", "list", "info", "leave", "kick"));
    }
    @Override public void execute(String[] args) {
        FriendPingsModule.getInstance().runPartyArgs(args);
    }
}
