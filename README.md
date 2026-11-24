# EVFlow: Team Alpha portfolio site

Team portfolio for UCS503 Software Engineering. Public site, admin/API, file storage and automatic deployment.

| Part | Technology |
|---|---|
| Public site | Static HTML/CSS/JS in `public/` on Cloudflare Pages |
| Admin + API | Cloudflare Pages Functions (`functions/api/[[path]].js`): login, upload, metadata, publish/unpublish, versioning, roles |
| File storage | Cloudflare R2 (files) + D1 (metadata and versions) |
| Repo + deploy | GitHub, auto-deploy on every push; `build.js` stamps version and commit on the site |

**Roles:** `instructor` can log in and upload. `admin` (team) can also publish/unpublish and delete.
**Versions:** `/planning/v1/` is permanent. To revise, copy the folder to `public/planning/v2/` and edit it; never overwrite v1.
