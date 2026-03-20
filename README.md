# Aquacise site (Jekyll)

[Read the tutorial](http://taniarascia.com/make-a-static-website-with-jekyll)"# aquacise"

## Publish to GitHub Pages (`aquacise-new`)

The live site URL will be:

**https://originaldogmeat.github.io/aquacise-new/**

1. On GitHub, create a new **public** repository named **`aquacise-new`** (do not add a README or license if you want a clean push).
2. Point this project at it and push:

```bash
git branch --unset-upstream 2>/dev/null || true
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/originaldogmeat/aquacise-new.git
git push -u origin main
```

3. In the repo on GitHub: **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”). If you skip this, the site will **404** until Pages is wired to Actions.
4. Open the **Actions** tab and confirm the **Deploy Jekyll site to Pages** workflow succeeds (green check). Fix any red runs before expecting the site to load.
5. Wait 1–10 minutes after the first successful deploy, then open **https://originaldogmeat.github.io/aquacise-new/** (include the repo name in the path).

### If you see **404**

| Check | What to do |
|--------|------------|
| Pages source | **Settings → Pages**: source must be **GitHub Actions**, not “Deploy from a branch” with an empty branch. |
| Workflow | **Actions** tab: the latest **Deploy Jekyll site to Pages** run must complete successfully. Open the run and read the error log if it failed. |
| Repo URL | Project sites use `https://username.github.io/repo-name/` (with your real username and repo name). The repo must be **public** unless you use a paid plan that supports private Pages. |
| Wrong account | If the repo is under a different user/org than `originaldogmeat`, update `url` in `_config.yml` and push again. |

More detail: [Troubleshooting 404s for GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/troubleshooting-404-errors-for-github-pages-sites).

`baseurl` is set to `/aquacise-new` in `_config.yml` so asset and link paths match the project site.

### Local preview

```bash
bundle install
bundle exec jekyll serve --config _config.yml,_config_dev.yml
```

(`_config_dev.yml` uses `baseurl: ""` so links work at `http://localhost:4000`.)

## Team events page

The **Events** page mirrors GoMotion **Team Events** only. Refresh data:

```bash
python3 scripts/sync_team_events.py
```

Commit `_data/team_events.json`, then push (GitHub Actions will rebuild the site).
