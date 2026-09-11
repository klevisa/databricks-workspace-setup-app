# databricks-workspace-setup-app

An interactive, client-side walkthrough of a **least-privilege Databricks workspace on GCP**
(Shared VPC + Private Service Connect + CMEK). One trust-zone topology, three views:

1. **Deployment** — step through the 8-step build (2.1 → 2.8). Each step shows its owning
   **team**, the **privileges** that team uses, and the **resources it creates** — and the
   topology diagram fills in as you go (PSC endpoints flip PENDING → ACCEPTED, DNS records
   appear, operator-role grants draw in, the workspace reaches RUNNING).
2. **Cluster launch** — the L0 → L3 launch flow animated over the completed topology:
   the analyst signing in over SSO (Okta, SAML/OIDC — never crossing the perimeter), the
   analyst's `clusters/create`, the control plane launching VMs *as the Workspace SA*, and
   the cluster dialing home over the SCC relay.
3. **Notebook command** — steady-state runtime: a command in, UC metadata + a down-scoped
   token, a governed read through the VPC-SC ingress gate (as the vended UC SA), Photon
   executing, results back — nothing data-bearing crossing the control plane.

Pure HTML/CSS/JS, no build step, no dependencies. Use ‹ › or arrow keys / **Play** to move
through each view; click any resource for its detail.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy

Hosted on GitHub Pages from `main` / root → `https://klevisa.github.io/databricks-workspace-setup-app/`.

## Files

- `index.html` — layout (tabs, step rail, canvas, detail panel)
- `app.js` — the topology data model (containers + resource nodes tagged with the step they
  appear at), the deployment/launch/runtime stage definitions, and the SVG render + animation engine
- `style.css` — styles (light theme matching the source diagrams)
- `assets/` — the four source v2 architecture diagrams the topology, launch, and runtime views
  were built from (reference only; the app rebuilds the topology inline so each element can be
  revealed/animated on cue)

## Sources

Built from the [shared-vpc-cmk-psc-databricks-deployment](https://github.com/klevisa/shared-vpc-cmk-psc-databricks-deployment)
playbook and the [Databricks least-privilege workspace docs](https://docs.databricks.com/gcp/en/admin/workspace/create-least-privilege-workspace).
