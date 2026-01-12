import { authState, state } from "./state.js";
import { openAuthDialog } from "./auth.js";
import { toast } from "./ui.js";
import { saveJson, LSPOOL, LSWATCHED, LSFILTERS } from "./storage.js";
import { renderPool } from "./render.js";
import { scheduleCloudSave } from "./rooms.js";

export async function importSharedListToAccount() {
    if (!authState.user) {
        openAuthDialog();
        toast("Sign in to import this list.", "info");
        return;
    }

    // Save current state (already loaded from shared link) into local + cloud
    saveJson(LSPOOL, state.pool);
    saveJson(LSWATCHED, Array.from(state.watched));
    saveJson(LSFILTERS, state.filters);

    renderPool();
    scheduleCloudSave();
    toast("Imported to your account.", "success");

}