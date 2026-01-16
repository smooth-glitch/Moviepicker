import { id } from "./dom.js";
import { state } from "./state.js";
import { saveJson, LSFILTERS } from "./storage.js";
import { tmdb } from "./tmdb.js";
import { toast } from "./ui.js";
import { renderResultsLoading, renderResults, setBusy } from "./render.js";
import { filterResultsByOtt, selectedProviderIds } from "./watchFilters.js";

export async function loadTrending(page = 1) {
    try {
        setBusy(true);
        renderResultsLoading();

        state.lastMode = "trending";
        state.lastQuery = "";
        state.page = page;

        const data = await tmdb("trending/movie/day", { language: "en-US", page });
        state.totalPages = data.total_pages || 1;

        renderResults(data.results);
    } catch {
        toast("Trending failed. Check API key / network.", "error");
        state.totalPages = 1;
        renderResults([]);
    } finally {
        setBusy(false);
    }
}

export async function doSearch(page = 1) {
    const q = id("q");
    const resultSort = id("resultSort");

    const query = q ? q.value.trim() : "";
    const sort = resultSort?.value || "popularity.desc";
    const minVote = Number(state.filters.minRating ?? 0);
    const kind = state.filters.mediaType || "movie";
    const year = String(state.filters.year || "").trim();

    const genres = Array.isArray(state.filters.genres) ? state.filters.genres : [];
    const withGenres = genres.length ? genres.join(",") : undefined;

    try {
        setBusy(true);
        renderResultsLoading();

        state.page = page;
        state.lastSort = sort;

        let data;

        if (query) {
            state.lastMode = "search";
            state.lastQuery = query;

            data = await tmdb(`search/${kind}`, {
                query,
                language: "en-US",
                include_adult: false,
                page,
            });

            data.results = await filterResultsByOtt(kind, data.results || []);
            data.total_pages = 1;
            state.totalPages = 1;
        } else {
            state.lastMode = "discover";
            state.lastQuery = "";

            const params = {
                language: "en-US",
                sort_by: sort,
                "vote_average.gte": minVote,
                "vote_count.gte": 100,
                with_genres: withGenres,
                page,
            };

            if (kind === "movie" && year) params.primary_release_year = year;
            if (kind === "tv" && year) params.first_air_date_year = year;

            const providerIds = selectedProviderIds();

            // UPDATED: Regional availability logic
            if (state.filters.regionalOnly && state.filters.region) {
                // Regional only mode ON
                params.watch_region = state.filters.region;

                if (providerIds.length) {
                    // Specific providers selected
                    params.with_watch_providers = providerIds.join("|");
                    params.with_watch_monetization_types = "flatrate";
                } else {
                    // No specific providers - show all available in region
                    params.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
                }
            } else if (providerIds.length) {
                // Regional only OFF but providers selected
                params.with_watch_providers = providerIds.join("|");
                params.watch_region = state.filters.region || "IN";
                params.with_watch_monetization_types = "flatrate";
            }

            data = await tmdb(`discover/${kind}`, params);
            state.totalPages = data.total_pages || 1;
        }

        renderResults(data.results);
    } catch {
        toast("Search/discover failed.", "error");
        state.totalPages = 1;
        renderResults([]);
    } finally {
        setBusy(false);
    }
}

