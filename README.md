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

3. In the repo on GitHub: **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”).
4. Open the **Actions** tab and confirm the **Deploy Jekyll site to Pages** workflow succeeds. The site appears after the first green run (often within a minute or two).

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
