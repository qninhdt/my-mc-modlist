# Modrinth API (Labrinth)

Complete reference for the **Modrinth API** (v2), known internally as Labrinth.

- **API version:** 2.0.0 (v2)
- **Base URL:** `https://api.modrinth.com/v2`
- **Spec source:** `https://docs.modrinth.com/api-spec/`
- **Auth:** Personal Access Token (PAT) or OAuth2 Token in the `Authorization` header.

---

## Acceptable Use

The API is free to use and intended to power tools, integrations, launchers, and projects built within the Modrinth ecosystem.

- **Don't** scrape the entire API or download files unnecessarily.
- **Do** cache responses when possible.
- If unsure whether a use is okay, ask on the Modrinth Discord.

**Attribution** (not required, but appreciated): link back to [modrinth.com](https://modrinth.com).

---

## Rate Limiting

- **Rate limit:** 300 requests per minute per IP.
- Rate limit headers are included in every response:
  - `X-Ratelimit-Limit`: The maximum number of requests you can make in the current window.
  - `X-Ratelimit-Remaining`: The number of requests remaining in the current window.
  - `X-Ratelimit-Reset`: The time (in seconds) until the rate limit window resets.

---

## User-Agent Requirement

Send a **descriptive `User-Agent`** header on every request that identifies your app and gives a contact. Modrinth enforces this strictly.

Example:
```
User-Agent: github_username/project_name/1.2.0 (contact@example.com)
```

- Requests with **no `User-Agent` or generic `User-Agent` (like `curl/7.68.0`) are rejected with `400 Bad Request` or `403 Forbidden`**.

---

## Data Model & IDs

Modrinth uses base62 strings for IDs (e.g., `P7dR8mSH` for a project, `8bM8Rk5j` for a version). 

Many endpoints accept either the **ID** or the **Slug** (e.g., `fabric-api`). IDs are immutable, while slugs can be changed by the project owner. It is recommended to store IDs rather than slugs.

---

## Endpoints

### 1. Search

#### `GET /search`
Searches for projects on Modrinth.

- **Query params:**
  - `query`: The search query.
  - `facets`: JSON array of arrays for filtering. E.g., `[["categories:fabric"],["versions:1.19.2"]]` (AND between inner arrays, OR within inner arrays).
  - `index`: Sort order. Options: `relevance`, `downloads`, `follows`, `newest`, `updated`. (Default: `relevance`)
  - `offset`: Offset for pagination. (Default: 0)
  - `limit`: Number of results to return. (Default: 10, Max: 100)
- **Returns:** An object containing `hits` (array of project search results), `offset`, `limit`, and `total_hits`.

---

### 2. Projects

#### `GET /project/{id|slug}`
Returns details about a specific project.

- **Path:** `id|slug` (string, required).
- **Returns:** Project object.

#### `PATCH /project/{id|slug}`
Modifies a specific project.

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `PROJECT_EDIT` permission.
- **Returns:** `204 No Content` on success.

#### `DELETE /project/{id|slug}`
Deletes a specific project.

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `PROJECT_DELETE` permission.
- **Returns:** `204 No Content` on success.

#### `GET /projects`
Returns multiple projects by their IDs or slugs.

- **Query params:** `ids` (JSON array of strings, e.g., `ids=["P7dR8mSH","fabric-api"]`).
- **Returns:** Array of project objects.

#### `POST /project`
Creates a new project.

- **Auth:** Requires `PROJECT_CREATE` permission.
- **Body:** JSON object or multipart form.
- **Returns:** Created project object.

#### `GET /project/{id|slug}/dependencies`
Returns all dependencies of a project.

- **Path:** `id|slug` (string, required).
- **Returns:** An object containing `projects` (dependencies) and `versions` (associated versions).

#### `GET /project/{id|slug}/gallery`
Retrieves a list of images uploaded to the project's gallery.

- **Path:** `id|slug` (string, required).
- **Returns:** Array of gallery image objects.

#### `POST /project/{id|slug}/gallery`
Adds a new image to the project's gallery.

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `PROJECT_EDIT` permission.
- **Query params:** `featured` (boolean), `title` (string), `description` (string), `ordering` (integer).
- **Body:** Binary image data.
- **Returns:** `204 No Content` on success.

#### `PATCH /project/{id|slug}/gallery`
Modifies a gallery image.

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `PROJECT_EDIT` permission.
- **Query params:** `url` (string, required), `featured` (boolean), `title` (string), `description` (string), `ordering` (integer).
- **Returns:** `204 No Content` on success.

#### `DELETE /project/{id|slug}/gallery`
Removes a gallery image.

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `PROJECT_EDIT` permission.
- **Query params:** `url` (string, required).
- **Returns:** `204 No Content` on success.

#### `POST /project/{id|slug}/icon`
Uploads a project icon.

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `PROJECT_EDIT` permission.
- **Query params:** `ext` (string, e.g., `png`, `jpg`).
- **Body:** Binary image data.
- **Returns:** `204 No Content` on success.

#### `DELETE /project/{id|slug}/icon`
Deletes a project's icon.

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `PROJECT_EDIT` permission.
- **Returns:** `204 No Content` on success.

#### `POST /project/{id|slug}/follow`
Follows a project.

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `USER_FOLLOW` permission.
- **Returns:** `204 No Content` on success.

#### `DELETE /project/{id|slug}/follow`
Unfollows a project.

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `USER_FOLLOW` permission.
- **Returns:** `204 No Content` on success.

#### `GET /project/{id|slug}/members`
Gets the members of the team that owns the project.

- **Path:** `id|slug` (string, required).
- **Returns:** Array of team member objects.

#### `GET /project/{id|slug}/schedule`
Gets the schedule of when the project status should change (for delayed release).

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `PROJECT_EDIT` permission.
- **Returns:** Array of schedule objects.

#### `POST /project/{id|slug}/schedule`
Schedules the project status change.

- **Path:** `id|slug` (string, required).
- **Auth:** Requires `PROJECT_EDIT` permission.
- **Body:** JSON containing target status and execution date.
- **Returns:** `204 No Content` on success.

#### `GET /project/{id|slug}/check`
Checks if a project ID or slug is valid.

- **Path:** `id|slug` (string, required).
- **Returns:** An object containing the project ID if it exists.

---

### 3. Versions

#### `GET /version/{id}`
Returns details for a specific version.

- **Path:** `id` (string, required).
- **Returns:** Version object.

#### `PATCH /version/{id}`
Modifies a specific version.

- **Path:** `id` (string, required).
- **Auth:** Requires `VERSION_EDIT` permission.
- **Returns:** `204 No Content` on success.

#### `DELETE /version/{id}`
Deletes a specific version.

- **Path:** `id` (string, required).
- **Auth:** Requires `VERSION_DELETE` permission.
- **Returns:** `204 No Content` on success.

#### `GET /versions`
Returns multiple versions by their IDs.

- **Query params:** `ids` (JSON array of strings).
- **Returns:** Array of version objects.

#### `POST /version`
Creates a new version for a project.

- **Auth:** Requires `VERSION_CREATE` permission.
- **Body:** Multipart form data containing a `data` field (JSON version metadata) and file field(s).
- **Returns:** Created version object.

#### `GET /project/{id|slug}/version`
Returns a list of versions for a specific project.

- **Path:** `id|slug` (string, required).
- **Query params:**
  - `loaders`: JSON array of loaders (e.g., `["fabric"]`).
  - `game_versions`: JSON array of Minecraft versions (e.g., `["1.19.2"]`).
  - `featured`: Boolean to filter featured versions.
- **Returns:** Array of version objects.

---

### 4. Version Files

#### `GET /version_file/{hash}`
Returns the version corresponding to a given file hash.

- **Path:** `hash` (string, required - hex representation).
- **Query params:** `algorithm` (`sha1` or `sha512`. Default: `sha1`).
- **Returns:** Version object.

#### `DELETE /version_file/{hash}`
Deletes a version file by its hash.

- **Path:** `hash` (string, required).
- **Auth:** Requires `VERSION_DELETE` permission.
- **Query params:** `algorithm` (`sha1` or `sha512`. Default: `sha1`).
- **Returns:** `204 No Content` on success.

#### `POST /version_file/{hash}/unschedule`
Unschedule a version file from release.

- **Path:** `hash` (string, required).
- **Auth:** Requires `VERSION_EDIT` permission.
- **Query params:** `algorithm` (`sha1` or `sha512`. Default: `sha1`).
- **Returns:** `204 No Content` on success.

#### `POST /version_files`
Returns multiple versions corresponding to multiple file hashes.

- **Body:** JSON object containing `hashes` (array of strings) and `algorithm` (`sha1` or `sha512`).
- **Returns:** Map of hash to Version object.

#### `GET /version_file/{hash}/update`
Finds the latest version that contains updates for the file.

- **Path:** `hash` (string, required).
- **Query params:**
  - `algorithm` (`sha1` or `sha512`. Default: `sha1`).
  - `loaders` (JSON array of loaders, required).
  - `game_versions` (JSON array of game versions, required).
- **Returns:** Latest compatible Version object.

#### `POST /version_files/update`
Finds the latest compatible versions for multiple files based on hashes.

- **Body:** JSON containing `hashes` (array of strings), `algorithm`, `loaders` (array), and `game_versions` (array).
- **Returns:** Map of hash to latest compatible Version object.

---

### 5. Users

#### `GET /user/{id|username}`
Returns details about a specific user.

- **Path:** `id|username` (string, required).
- **Returns:** User object.

#### `PATCH /user/{id|username}`
Modifies a user's details.

- **Path:** `id|username` (string, required).
- **Auth:** Requires `USER_EDIT` permission.
- **Returns:** `204 No Content` on success.

#### `GET /user`
Returns details about the currently authenticated user.

- **Auth:** Requires `USER_READ` permission.
- **Returns:** User object (including email and payout settings if authorized).

#### `GET /users`
Returns multiple users by their IDs.

- **Query params:** `ids` (JSON array of strings).
- **Returns:** Array of user objects.

#### `GET /user/{id|username}/projects`
Returns projects created by a specific user.

- **Path:** `id|username` (string, required).
- **Returns:** Array of project objects.

#### `GET /user/{id|username}/notifications`
Returns notifications for a specific user.

- **Path:** `id|username` (string, required).
- **Auth:** Requires `USER_NOTIFICATIONS_READ` permission.
- **Returns:** Array of notification objects.

#### `GET /user/{id|username}/follows`
Returns projects followed by a specific user.

- **Path:** `id|username` (string, required).
- **Auth:** Requires `USER_FOLLOWS_READ` (or viewing public follows).
- **Returns:** Array of project objects.

#### `GET /user/{id|username}/payouts`
Returns payout history for a specific user.

- **Path:** `id|username` (string, required).
- **Auth:** Requires `USER_PAYOUTS_READ` permission.
- **Returns:** Payout data object.

---

### 6. Teams

#### `GET /team/{id}/members`
Gets the members of a team.

- **Path:** `id` (string, required - team ID).
- **Returns:** Array of team member objects.

#### `GET /teams`
Returns multiple teams by their IDs.

- **Query params:** `ids` (JSON array of strings).
- **Returns:** Array of team objects (each containing lists of member objects).

#### `POST /team/{id}/members`
Adds a member to a team.

- **Path:** `id` (string, required).
- **Auth:** Requires `TEAM_EDIT` permission.
- **Body:** JSON containing the user ID of the new member.
- **Returns:** `204 No Content` on success.

#### `PATCH /team/{id}/members`
Modifies a team member's role or permissions.

- **Path:** `id` (string, required).
- **Auth:** Requires `TEAM_EDIT` permission.
- **Body:** JSON containing the member user ID and target role/permissions.
- **Returns:** `204 No Content` on success.

#### `DELETE /team/{id}/members`
Removes a member from a team.

- **Path:** `id` (string, required).
- **Auth:** Requires `TEAM_EDIT` permission.
- **Body:** JSON containing the user ID to remove.
- **Returns:** `204 No Content` on success.

#### `POST /team/{id}/join`
Joins an open team or accepts a team invitation.

- **Path:** `id` (string, required).
- **Auth:** Requires `TEAM_EDIT` permission.
- **Returns:** `204 No Content` on success.

#### `POST /team/{id}/transfer`
Transfers team ownership to another team member.

- **Path:** `id` (string, required).
- **Auth:** Requires `TEAM_EDIT` (Owner status).
- **Body:** JSON containing the target user ID.
- **Returns:** `204 No Content` on success.

---

### 7. Notifications

#### `GET /notification/{id}`
Returns details for a specific notification.

- **Path:** `id` (string, required).
- **Auth:** Requires `USER_NOTIFICATIONS_READ` permission.
- **Returns:** Notification object.

#### `DELETE /notification/{id}`
Deletes a specific notification.

- **Path:** `id` (string, required).
- **Auth:** Requires `USER_NOTIFICATIONS_WRITE` permission.
- **Returns:** `204 No Content` on success.

#### `POST /notification`
Creates a notification (usually system or admin-only).

- **Auth:** Requires admin permissions.
- **Returns:** Created notification object.

#### `POST /notifications`
Creates multiple notifications.

- **Auth:** Requires admin permissions.
- **Returns:** Array of created notifications.

#### `PATCH /notifications`
Marks multiple notifications as read or deleted.

- **Auth:** Requires `USER_NOTIFICATIONS_WRITE` permission.
- **Body:** JSON containing `ids` (array of notification IDs) and `action` (`read` or `delete`).
- **Returns:** `204 No Content` on success.

---

### 8. Reports

#### `POST /report`
Creates a report against a project, version, or user.

- **Auth:** Requires `REPORT_CREATE` permission.
- **Body:** JSON containing report details (type, item ID, description).
- **Returns:** Created report object.

#### `GET /report/{id}`
Returns details for a specific report.

- **Path:** `id` (string, required).
- **Auth:** Requires admin/moderator permissions.
- **Returns:** Report object.

#### `GET /reports`
Returns multiple reports.

- **Auth:** Requires admin/moderator permissions.
- **Query params:** `ids` (JSON array of strings).
- **Returns:** Array of report objects.

#### `PATCH /report/{id}`
Modifies a report (e.g. status, moderator notes).

- **Path:** `id` (string, required).
- **Auth:** Requires admin/moderator permissions.
- **Returns:** `204 No Content` on success.

---

### 9. Tags (Metadata Lists)

These endpoints return lists of categories, loaders, licenses, etc. that are valid on the platform. All are **public** and do not require authentication.

#### `GET /tag/category`
Returns a list of all categories.

- **Returns:** Array of category tag objects (each includes `name`, `icon` (SVG), `project_type`, `header`).

#### `GET /tag/loader`
Returns a list of all mod loaders.

- **Returns:** Array of loader tag objects.

#### `GET /tag/game_version`
Returns a list of all game versions (Minecraft versions).

- **Returns:** Array of game version objects.

#### `GET /tag/license`
Returns a list of all licenses.

- **Returns:** Array of license objects.

#### `GET /tag/donation_platform`
Returns a list of supported donation platforms.

- **Returns:** Array of donation platform objects.

#### `GET /tag/report_type`
Returns a list of valid report types.

- **Returns:** Array of report types.

#### `GET /tag/project_type`
Returns a list of valid project types.

- **Returns:** Array of project types (`mod`, `modpack`, `resourcepack`, `shader`).

---

### 10. Miscellaneous

#### `GET /`
Standard connectivity and info route.

- **Returns:** JSON containing basic info (`about`, `documentation`, `name`, `version`).

#### `GET /statistics`
Retrieves statistics about the Modrinth platform.

- **Returns:** JSON containing stats (projects count, versions count, files count, downloads count).

---

## Example Objects

### Project

```json
{
  "slug": "fabric-api",
  "title": "Fabric API",
  "description": "Lightweight and modular API providing common hooks and intercompatibility measures...",
  "categories": ["api", "utility"],
  "client_side": "required",
  "server_side": "required",
  "body": "...",
  "status": "approved",
  "requested_status": "approved",
  "additional_categories": [],
  "issues_url": "https://github.com/FabricMC/fabric/issues",
  "source_url": "https://github.com/FabricMC/fabric",
  "wiki_url": null,
  "discord_url": "https://discord.gg/v6v4pMv",
  "donation_urls": [],
  "project_type": "mod",
  "downloads": 105658883,
  "icon_url": "https://cdn.modrinth.com/data/P7dR8mSH/icon.png",
  "color": 14534830,
  "thread_id": "8bM8Rk5j",
  "monetization_status": "monetized",
  "id": "P7dR8mSH",
  "team": "4mO7A2H3",
  "published": "2020-12-24T14:48:30.932371Z",
  "updated": "2024-03-20T12:00:00.000000Z",
  "approved": "2020-12-24T14:48:30.932371Z",
  "followers": 15488,
  "license": {
    "id": "Apache-2.0",
    "name": "Apache License 2.0",
    "url": "https://choosealicense.com/licenses/apache-2.0/"
  },
  "versions": ["8bM8Rk5j", "xyz123"]
}
```

### Version

```json
{
  "name": "Fabric API 0.83.0+1.20",
  "version_number": "0.83.0+1.20",
  "changelog": "Update to 1.20...",
  "dependencies": [],
  "game_versions": ["1.20", "1.20.1"],
  "version_type": "release",
  "loaders": ["fabric"],
  "featured": true,
  "status": "listed",
  "requested_status": "listed",
  "id": "8bM8Rk5j",
  "project_id": "P7dR8mSH",
  "author_id": "5mO7A2H4",
  "date_published": "2023-06-07T12:00:00.000000Z",
  "downloads": 245000,
  "files": [
    {
      "hashes": {
        "sha512": "b5a93...",
        "sha1": "c8d4e..."
      },
      "url": "https://cdn.modrinth.com/data/P7dR8mSH/versions/8bM8Rk5j/fabric-api-0.83.0%2B1.20.jar",
      "filename": "fabric-api-0.83.0+1.20.jar",
      "primary": true,
      "size": 1845600,
      "file_type": null
    }
  ]
}
```

---

## Notes for Building a Downloader

Unlike Modpack Index, **Modrinth hosts files directly**. To download a mod:

1. Request the specific version or query for a project's versions (`GET /project/{id}/version`).
2. Pick the appropriate version object.
3. Access the `files[]` array. Find the file where `primary` is `true`.
4. Use the `url` provided in the file object to download the `.jar` (or `.zip` for modpacks).
5. (Crucial) Verify the downloaded file using the `hashes` provided (SHA-1 or SHA-512) to ensure integrity.

Always set a valid, descriptive `User-Agent`. If you are making many requests, consider authenticating with a PAT or OAuth2 token to ensure smooth access.
