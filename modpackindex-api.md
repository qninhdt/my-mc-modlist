# Modpack Index API

Complete reference for the **Modpack Index public API** (v1).

- **OpenAPI version:** 3.0.3
- **API version:** 1.0.0
- **Base URL:** `https://www.modpackindex.com/api/v1`
- **Spec source:** `https://www.modpackindex.com/openapi.yaml` (rendered at `/api`)
- **Auth:** None required (no API key).

The API provides a structured way to get mod, modpack, author, category, launcher, and Minecraft-version data from Modpack Index.

---

## Acceptable Use

The API is free to use and intended to power tools, integrations, and projects built *alongside* Modpack Index.

- **Don't** bulk-scrape the catalog.
- **Don't** stand up a service that re-hosts this data as a competing mod/modpack index.
- The underlying mods and modpacks belong to their respective authors.
- If unsure whether a use is okay, ask on their Discord.

**Attribution** (not required, but appreciated): link back to [modpackindex.com](https://www.modpackindex.com) or the item's `page_url`.

**Usage & privacy:** the service records request **IP** and **User-Agent**, aggregated per day, kept ~90 days, then deleted. Used only to operate and protect the service.

---

## Rate Limiting

- **3,600 requests per hour.**
- Need more? Ask on their Discord.

---

## User-Agent Requirement

Send a **descriptive `User-Agent`** header on every request that identifies your app and gives a contact. Example:

```
User-Agent: MyCoolModpackApp/1.2 (contact: you@example.com)
```

- Requests with **no `User-Agent` are rejected with `403 Forbidden`**.
- Requests with a generic `User-Agent` may be rate limited more aggressively.

---

## Data Sources & Cross-Platform Links

Modpack Index aggregates from **CurseForge**, **Modrinth**, and **FTB (Feed the Beast)**. A single item may link to more than one source.

Every mod and modpack object exposes:

| Field | Meaning |
|---|---|
| `url` | Canonical page URL on its primary source. |
| `links` | Source-aware map. Keys (`curseforge`, `modrinth`, `feed-the-beast`) are **only present when that source exists**. |
| `page_url` | The item's page on modpackindex.com. |
| `curse_info` | CurseForge source metadata (contains `curse_id`) when on CurseForge. |
| `modrinth_info` | Modrinth metadata when on Modrinth. **On a modpack: a single object or `null`. On a mod: an array** (a mod may map to more than one Modrinth project). |

A `modrinth_info` entry includes: `project_id`, `slug`, `url`, `downloads`, `follows`, `icon_url`, `client_side`/`server_side`, `license`, `categories`, `loaders`, `source_url`/`issues_url`/`wiki_url`/`discord_url`, and `date_created`/`date_modified`.

> The `links` map is the bridge between CurseForge and Modrinth: the two platforms use unrelated IDs (CurseForge = integer, Modrinth = base62), so this field is how you resolve one to the other.

---

## Merged & Removed Records

Because the same item can be listed on multiple platforms, duplicate records sometimes get **merged** into one surviving record. IDs are never silently reused or dropped — the old ID stays valid forever and forwards to the survivor.

| Status | Meaning | What to do |
|---|---|---|
| `301 Moved Permanently` | The requested ID was **merged** into another record. A `Location` header points at the surviving API URL. | Most clients follow the redirect automatically. Update any stored ID to `merged_into`. |
| `410 Gone` | The record was **permanently removed** with no replacement. | Drop the stored ID. |
| `404 Not Found` | The ID **never existed**. | — |

`301` response body (for clients that don't auto-follow redirects):

```json
{
  "id": 38362,
  "merged_into": 89009,
  "location": "https://www.modpackindex.com/api/v1/modpack/89009"
}
```

On the **single-item** endpoints (`GET /modpack/{id}`, `GET /mod/{id}`), the surviving record also exposes a **`merged_from`** array listing old IDs that now point to it. This field appears only on single-item responses, not in list results.

---

## Pagination

List endpoints return `data`, `links`, and `meta`:

```json
{
  "data": [ /* ... */ ],
  "links": {
    "first": "https://www.modpackindex.com/api/v1/mods?page=1",
    "last":  "https://www.modpackindex.com/api/v1/mods?page=5363",
    "prev":  null,
    "next":  "https://www.modpackindex.com/api/v1/mods?page=2"
  },
  "meta": {
    "current_page": 1,
    "from": 1,
    "last_page": 5363,
    "path": "https://www.modpackindex.com/api/v1/mods",
    "per_page": "3",
    "to": 3,
    "total": 16089
  }
}
```

Common query parameters on list endpoints:

| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | number | 25 | Results per page. **Max: 100.** |
| `page` | number | 1 | Page of results. |

---

## Endpoints

### 1. Authors

#### `GET /authors`
Returns a paginated list of authors.

- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
- **Returns:** Paginated response with `data` containing array of author objects:
  - `id` (number)
  - `curse_user_id` (number)
  - `twitch_id` (number)
  - `name` (string)
  - `slug` (string)
  - `url` (string)
  - `updated_at` (string)

#### `GET /author/{author_id}`
Returns details of a specific author, including their attached mods and modpacks.

- **Path Parameters:**
  - `author_id` (number, required): The ID of the author.
- **Returns:** An author object containing:
  - Author fields (`id`, `curse_user_id`, `twitch_id`, `name`, `slug`, `url`, `updated_at`)
  - `modpacks` (array of modpack objects: `id`, `name`, `slug`, `summary`, `download_count`, `thumbnail_url`, `primary_language`, `popularity_rank`, `latest_release_date`, `last_modified`, `last_updated`)
  - `mods` (array of mod objects: `id`, `name`, `slug`, `summary`, `download_count`, `thumbnail_url`, `primary_language`, `popularity_rank`, `latest_release_date`, `last_modified`, `last_updated`)

---

### 2. Categories

#### `GET /categories`
Returns a paginated list of categories.

- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
- **Returns:** Paginated response with `data` containing array of category objects:
  - `id` (number)
  - `curse_id` (number)
  - `name` (string)
  - `slug` (string)
  - `summary` (string, nullable)
  - `thumbnail_url` (string)
  - `curse_parent_game_category_id` (number)
  - `curse_root_game_category_id` (number)
  - `curse_game_id` (number)
  - `curse_date_modified` (string)
  - `updated_at` (string)

#### `GET /category/{category_id}`
Returns details for a specific category.

- **Path Parameters:**
  - `category_id` (number, required): The ID of the category.
- **Returns:** Category object details.

#### `GET /category/{category_id}/mods`
Returns a paginated list of mods belonging to a specific category.

- **Path Parameters:**
  - `category_id` (number, required): The ID of the category.
- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
- **Returns:** Paginated response containing an array of mod objects.

#### `GET /category/{category_id}/modpacks`
Returns a paginated list of modpacks belonging to a specific category.

- **Path Parameters:**
  - `category_id` (number, required): The ID of the category.
- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
- **Returns:** Paginated response containing an array of modpack objects.

---

### 3. Launchers

#### `GET /launchers`
Returns a list of all game launchers supported.

- **Query Parameters:** None.
- **Returns:** Array of launcher objects:
  - `id` (number)
  - `name` (string)
  - `slug` (string)
  - `url` (string)
  - `download_url` (string)
  - `updated_at` (string)

#### `GET /launcher/{launcher_id}`
Returns details for a specific launcher.

- **Path Parameters:**
  - `launcher_id` (number, required): The ID of the launcher.
- **Returns:** Launcher object details.

#### `GET /launcher/{launcher_id}/mods`
Returns a paginated list of mods compatible with a specific launcher.

- **Path Parameters:**
  - `launcher_id` (number, required): The ID of the launcher.
- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
- **Returns:** Paginated response containing compatible mod objects.

#### `GET /launcher/{launcher_id}/modpacks`
Returns a paginated list of modpacks compatible with a specific launcher.

- **Path Parameters:**
  - `launcher_id` (number, required): The ID of the launcher.
- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
- **Returns:** Paginated response containing compatible modpack objects.

---

### 4. Minecraft Versions

#### `GET /minecraft/versions`
Returns a list of all Minecraft versions indexed.

- **Query Parameters:** None.
- **Returns:** Array of Minecraft version objects:
  - `id` (number)
  - `curse_id` (number)
  - `name` (string)
  - `slug` (string)
  - `curse_date_modified` (string)
  - `updated_at` (string)

#### `GET /minecraft/version/{version_id}`
Returns details for a specific Minecraft version.

- **Path Parameters:**
  - `version_id` (number, required): The ID of the Minecraft version.
- **Returns:** Minecraft version object details.

#### `GET /minecraft/version/{version_id}/mods`
Returns a paginated list of mods compatible with a specific Minecraft version.

- **Path Parameters:**
  - `version_id` (number, required): The ID of the Minecraft version.
- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
- **Returns:** Paginated response containing compatible mod objects.

#### `GET /minecraft/version/{version_id}/modpacks`
Returns a paginated list of modpacks compatible with a specific Minecraft version.

- **Path Parameters:**
  - `version_id` (number, required): The ID of the Minecraft version.
- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
- **Returns:** Paginated response containing compatible modpack objects.

---

### 5. Modpacks

#### `GET /modpacks`
Returns a paginated list of modpacks, optional search by name.

- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
  - `name`: Search by name. Typo-tolerant, relevance-ranked (most-downloaded first within a relevance tier). Capped at top 250 matches.
- **Returns:** Paginated response with `data` containing array of modpack objects:
  - `id` (number)
  - `name` (string)
  - `slug` (string)
  - `summary` (string)
  - `download_count` (number)
  - `thumbnail_url` (string)
  - `primary_language` (string)
  - `popularity_rank` (number)
  - `latest_release_date` (string)
  - `last_modified` (string)
  - `last_updated` (string)

#### `GET /modpack/{modpack_id}`
Returns details for a specific modpack.

- **Path Parameters:**
  - `modpack_id` (number, required): The ID of the modpack.
- **Responses:**
  - `200`: Success. Returns full modpack details object.
  - `301 Moved Permanently`: The modpack has been merged. Redirection URL is provided in the `Location` header.
  - `410 Gone`: The modpack has been permanently removed.
- **Returns:** Full modpack details object (including categories, authors, launchers, minecraft_versions, merged_from, curse_info, modrinth_info, page_url).

#### `GET /modpack/{modpack_id}/mods`
Returns the mods included in a specific modpack.

- **Path Parameters:**
  - `modpack_id` (number, required): The ID of the modpack.
- **Responses:**
  - `200`: Success. Returns array of mod objects inside the pack.
  - `301 Moved Permanently`: Redirection URL is provided in the `Location` header.
  - `410 Gone`: The modpack has been permanently removed.
- **Returns:** Array of mod objects.

---

### 6. Mods

#### `GET /mods`
Returns a paginated list of mods, optional search by name.

- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
  - `name`: Search by name. Typo-tolerant, relevance-ranked. Capped at top 250 matches.
- **Returns:** Paginated response with `data` containing array of rich mod objects (including categories, authors, launchers, and minecraft_versions nested inside).

#### `GET /mod/{mod_id}`
Returns details for a specific mod.

- **Path Parameters:**
  - `mod_id` (number, required): The ID of the mod.
- **Responses:**
  - `200`: Success. Returns full mod details object.
  - `301 Moved Permanently`: The mod has been merged. Redirection URL is provided in the `Location` header.
  - `410 Gone`: The mod has been permanently removed.
- **Returns:** Full mod details object (including categories, authors, launchers, minecraft_versions, merged_from, curse_info, modrinth_info, page_url).

#### `GET /mod/{mod_id}/modpacks`
Returns the modpacks that include a specific mod.

- **Path Parameters:**
  - `mod_id` (number, required): The ID of the mod.
- **Query Parameters:**
  - `limit`: Number of results to return. Max: 100. Default: 25.
  - `page`: Page of results. Default: 1.
- **Responses:**
  - `200`: Success. Returns paginated list of modpack objects containing this mod.
  - `301 Moved Permanently`: Redirection URL is provided in the `Location` header.
  - `410 Gone`: The mod has been permanently removed.
- **Returns:** Paginated response containing compatible modpack objects.

---

## Example Objects

### Mod (Single-Item Response)

```json
{
  "data": {
    "id": 10173,
    "name": "Buzzier Bees",
    "slug": "buzzier-bees",
    "summary": "A mod that improves the content in Buzzy Bees.",
    "url": "https://www.curseforge.com/minecraft/mc-mods/buzzier-bees",
    "links": {
      "curseforge": "https://www.curseforge.com/minecraft/mc-mods/buzzier-bees",
      "modrinth": "https://modrinth.com/mod/buzzier-bees"
    },
    "merged_from": [],
    "curse_info": { "curse_id": 360515 },
    "modrinth_info": [
      {
        "project_id": "mdYca5wt",
        "slug": "buzzier-bees",
        "title": "Buzzier Bees",
        "url": "https://modrinth.com/mod/buzzier-bees",
        "downloads": 128844,
        "follows": 904,
        "icon_url": "https://cdn.modrinth.com/data/mdYca5wt/icon.png",
        "client_side": "required",
        "server_side": "required",
        "license": "MIT",
        "categories": ["adventure", "food"],
        "loaders": ["forge", "fabric"],
        "source_url": "https://github.com/bageldotjpg/buzzier-bees",
        "issues_url": "https://github.com/bageldotjpg/buzzier-bees/issues",
        "wiki_url": null,
        "discord_url": null,
        "date_created": "2020-01-10T00:00:00.000000Z",
        "date_modified": "2020-05-15T23:25:49.000000Z"
      }
    ],
    "download_count": 851238,
    "popularity_rank": 549,
    "page_url": "https://www.modpackindex.com/mod/10173/buzzier-bees"
  }
}
```

### Modpack (Single-Item Response)

```json
{
  "data": {
    "id": 332,
    "name": "Valhelsia 2",
    "slug": "valhelsia-2",
    "url": "https://www.curseforge.com/minecraft/modpacks/valhelsia-2",
    "links": {
      "curseforge": "https://www.curseforge.com/minecraft/modpacks/valhelsia-2",
      "modrinth": "https://modrinth.com/modpack/valhelsia-2"
    },
    "merged_from": [],
    "curse_info": { "curse_id": 326067 },
    "modrinth_info": {
      "project_id": "xQq6raej",
      "slug": "valhelsia-2",
      "title": "Valhelsia 2",
      "url": "https://modrinth.com/modpack/valhelsia-2",
      "license": "LGPL-3.0-only",
      "loaders": ["forge"]
    },
    "download_count": 625868,
    "page_url": "https://www.modpackindex.com/modpack/332/valhelsia-2"
  }
}
```

---

## Notes for Building a Downloader

Modpack Index is an **index only** — it does not host mod files. To download a mod, use the `links` map to resolve to a hosting platform:

- `links.modrinth` → use the open **Modrinth API** (`api.modrinth.com`, no key) to get a version's `files[].url` and verify by `hashes.sha1`.
- `links.curseforge` → requires a valid CurseForge API key with appropriate scope, and some authors disable third-party downloads.

Always set a descriptive `User-Agent`, respect the 3,600 req/hr limit, and handle `301`/`410` when resolving stored IDs.
