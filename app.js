/* Databricks on GCP — interactive setup walkthrough.
   One trust-zone canvas (from diagram-1). Tab 1 builds it up step-by-step;
   tabs 2 & 3 animate the cluster-launch (diagram-3) and steady-state runtime
   (diagram-4) flows over the completed topology. Pure client-side, no deps. */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  var ORDER = ["0", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "3", "end"];
  var oi = function (s) { return ORDER.indexOf(String(s)); };

  /* ===== Global text-size lever (code-only — NOT exposed in the UI) =====
     1.0 = base sizes. Raise to enlarge ALL diagram text proportionally, e.g.
     1.25 = +25%, 1.4 = +40%. Line spacing and label boxes scale with it too.
     Very large values will eventually crowd the fixed-size boxes. */
  var FONT_SCALE = 1.2;
  function fs(px) { return Math.round(px * FONT_SCALE * 10) / 10; }

  var TEAM = {
    foundation: { name: "Cloud Foundation / Landing Zone", color: "#5b6b8c" },
    network:    { name: "Network Engineering",             color: "#2a78d6" },
    security:   { name: "Cloud Security / KMS",            color: "#d03b3b" },
    data:       { name: "Data / Databricks Platform",      color: "#eb6834" },
    iam:        { name: "Cloud IAM",                       color: "#7a4fb3" }
  };

  /* ---------------- containers (frames) ---------------- */
  var containers = [
    { id: "perimeter", step: "0", x: 300, y: 140, w: 910, h: 945, label: "YAHOO GCP — VPC-SC SERVICE PERIMETER (TRUST BOUNDARY)", cls: "perimeter" },
    { id: "host",      step: "0", x: 330, y: 190, w: 850, h: 367, label: "HOST PROJECT — SHARED VPC (NETWORK, CENTRALLY OWNED)", cls: "frame" },
    { id: "service",   step: "2.1", x: 330, y: 574, w: 420, h: 466, label: "SERVICE PROJECT — DATABRICKS COMPUTE + STORAGE", cls: "frame" },
    { id: "maildata",  step: "0", x: 770, y: 703, w: 410, h: 337, label: "YAHOO MAIL DATA PROJECTS (EXISTING)", cls: "frame" },
    { id: "dbx",       step: "0", x: 1240, y: 140, w: 400, h: 820, label: "DATABRICKS-OWNED GCP PROJECTS", label2: "— OUTSIDE THE PERIMETER", cls: "frame" },
    { id: "internet",  step: "0", x: 1240, y: 972, w: 400, h: 110, label: "PUBLIC INTERNET", cls: "frame" },
    { id: "uc",        step: "3", x: 1265, y: 688, w: 350, h: 266, label: "UNITY CATALOG — METASTORE", cls: "subframe",
      detail: {
        what: "The account-level Unity Catalog metastore. In the data-access phase it gains two storage credentials (each generating its own Databricks GCP SA) and two external locations that give the workspace governed access to GCS.",
        owner: "data",
        extra: [
          { label: "Read-only", body: "credential → vended SA with <code>objectViewer</code> + <code>legacyBucketReader</code> on the data-lake bucket; read-only external location over <code>gs://…</code>." },
          { label: "Read-write", body: "credential → vended SA with <code>objectAdmin</code> on the analytics bucket; read-write external location." } ],
        conn: ["Each vended SA reaches its bucket through a VPC-SC ingress rule (RO: read methods · RW: all)"],
        repo: "data-access/" } },
    { id: "pscsubnet", step: "2.2", x: 890, y: 225, w: 270, h: 265, label: "PSC SUBNET x.x.x.x/28 (min /28)", cls: "subframe" },
    { id: "nodesubnet",step: "2.2", x: 350, y: 420, w: 510, h: 122, label: "NODE SUBNET x.x.x.x/y · NPIP · PGA ON", cls: "subframe",
      detail: {
        what: "The private subnet the cluster VMs live in — NPIP (no public IPs), with Private Google Access ON so nodes reach Google APIs and the control plane privately.",
        owner: "network",
        extra: [
          { label: "Subnet sizing — 2 IPs per node", items: ["/21 → 1000 nodes", "/20 → 2000 nodes", "/19 → 4000 nodes", "(max compute nodes per workspace)"] },
          { label: "Required firewall rules", items: [
            "Ingress: allow all within the subnet CIDR (node ↔ node)",
            "Egress → PSC endpoint subnet: TCP 443 + 6666 + 8443–8451 (443 UI/REST + control plane · 6666 SCC relay to backend · 8443–8451 internal)",
            "Egress → <code>restricted.googleapis.com</code>: 199.36.153.4/30 (all) + 34.126.0.0/18 (TCP 443) — Google APIs via Private Google Access",
            "Deny-all egress by default · no public inbound"
          ] }
        ] } }
  ];

  /* ---------------- resource nodes ----------------
     step: when it appears in the deployment (ORDER) or "run" (only in tabs 2/3). */
  var nodes = [
    { id: "admin", step: "0", x: 40, y: 150, w: 230, h: 110, title: "Admin / Analyst",
      lines: ["Users — private access only"],
      detail: {
        what: "Yahoo admins and analysts. They reach the workspace over a private route only — there is no public front door.",
        conn: ["Browser / REST API / CLI → frontend PSC endpoint · TLS 443", "Auth: Okta session / PAT (OIDC on a back-channel)"] } },

    // Databricks-owned side
    { id: "wssa", step: "2.4", x: 1265, y: 180, w: 350, h: 95, title: "Workspace SA", accent: true,
      lines: ["The launcher (control-plane-owned)"],
      identity: ["IDENTITY", "cluster launcher"],
      detail: {
        what: "Databricks-owned service account, minted when the workspace is created (2.4). The control plane acts AS this SA to build and run the workspace — it launches cluster VMs and creates the workspace storage. It is never what the VMs run as.",
        extra: [
          { label: "Project role · granted 2.5 (read + actAs)", body: "16 perms — incl. <code>iam.serviceAccounts.actAs</code>, <code>compute.instances.list</code>." },
          { label: "Resource role · granted 2.5 (create · IAM-scoped)", body: "35 perms, scoped by IAM condition to this workspace's resources — incl. <code>storage.buckets.create</code>, <code>compute.instances.create</code>, <code>compute.disks.create</code>." },
          { label: "Network role · granted 2.6 (host node subnet)", body: "<code>compute.subnetworks.get</code>, <code>compute.subnetworks.use</code>." },
          { label: "CMEK · granted 2.7 (MANAGED_SERVICES)", body: "<code>cloudkms.cryptoKeyEncrypterDecrypter</code> on the CMEK key." } ],
        conn: ["Reached only via PSC — no public path"] } },
    { id: "plproxy", step: "0", x: 1265, y: 290, w: 350, h: 85, title: "PSC attachment — plproxy",
      lines: ["Frontend: Workspace UI / API"],
      detail: {
        what: "Databricks-side Private Service Connect producer for front-end traffic. The workspace's frontend PSC endpoint connects to it.",
        conn: ["Carries Workspace UI / API (users + clusters) · TLS 443"] } },
    { id: "ngrok", step: "0", x: 1265, y: 390, w: 350, h: 85, title: "PSC attachment — ngrok",
      lines: ["Backend: SCC relay"],
      detail: {
        what: "Databricks-side PSC producer for the secure cluster connectivity (SCC) relay — how clusters dial home with no inbound path.",
        conn: ["Carries SCC relay · TCP 6666 · always cluster-initiated"] } },
    { id: "controlplane", step: "0", x: 1265, y: 490, w: 350, h: 85, title: "Regional control plane",
      lines: ["Workspace UI/API · Cluster Manager · Jobs"],
      detail: {
        what: "The Databricks-managed regional services for this workspace: Workspace UI/API, the Cluster Manager that launches compute (acting as the Workspace SA), the Job Scheduler, and more.",
        conn: ["Reached only via the frontend PSC endpoint — no public ingress", "Control-plane data (notebooks, results, secrets) is CMEK-encrypted (2.7)"] } },
    { id: "accountapi", step: "0", x: 1265, y: 585, w: 350, h: 83, title: "Account API",
      lines: ["Provisioning + IdP sync"],
      detail: {
        what: "The account-level control plane at accounts.gcp.databricks.com. It provisions workspaces and syncs identities.",
        conn: ["Workspace provisioning (creates the workspace in 2.4)", "IdP sync: Okta → Account API"] } },
    // Unity Catalog objects (inside the uc frame), created at step 3.
    { id: "sc_ro", step: "3", x: 1280, y: 712, w: 320, h: 52, title: "Storage credential · source_data_ro",
      lines: [], identity: "IDENTITY · vended Databricks GCP SA (RO)",
      detail: {
        what: "Read-only storage credential. Databricks generates a GCP service account, granted objectViewer + legacyBucketReader on the existing data-lake bucket.",
        owner: "data",
        perms: ["roles/storage.objectViewer", "roles/storage.legacyBucketReader"], permsLabel: " · on the data-lake bucket",
        conn: ["Admitted by a VPC-SC ingress rule scoped to read methods (objects.get/list)"] } },
    { id: "sc_rw", step: "3", x: 1280, y: 832, w: 320, h: 52, title: "Storage credential · analytics_rw",
      lines: [], identity: "IDENTITY · vended Databricks GCP SA (RW)",
      detail: {
        what: "Read-write storage credential. Its own generated GCP service account is granted objectAdmin on the analytics bucket (created in this phase).",
        owner: "data",
        perms: ["roles/storage.objectAdmin", "roles/storage.legacyBucketReader"], permsLabel: " · on the analytics bucket",
        conn: ["Admitted by a VPC-SC ingress rule (all methods)"] } },
    { id: "el_ro", step: "3", x: 1280, y: 772, w: 320, h: 52, title: "External location · source_data",
      lines: ["read-only · gs://…/data-lake"],
      detail: {
        what: "Read-only external location over the data-lake bucket, using the read-only storage credential. Backs the source_data_ro catalog (namespace only; external tables registered later).",
        owner: "data" } },
    { id: "el_rw", step: "3", x: 1280, y: 892, w: 320, h: 52, title: "External location · analytics",
      lines: ["read-write · gs://…/analytics"],
      detail: {
        what: "Read-write external location over the analytics bucket, using the read-write storage credential. Backs the managed analytics catalog (its storage_root).",
        owner: "data" } },

    // Host project — network (2.2)
    { id: "dnszone", step: "2.2", x: 350, y: 235, w: 250, h: 155, title: "Private DNS zone",
      lines: ["Resolves hostnames →", "private PSC endpoint IPs"], pill: "dns",
      detail: {
        what: "A private Cloud DNS zone for gcp.databricks.com that maps the workspace hostnames to the reserved private IPs of the PSC endpoints, so resolution stays inside the VPC.",
        owner: "network",
        conn: ["Zone created in 2.2 (no records yet)", "4 A-records written in 2.6"],
        repo: "network/ · post-workspace/" } },
    { id: "routernat", step: "2.2", x: 620, y: 235, w: 262, h: 110, title: "Cloud Router + NAT",
      optional: true, lines: ["Outbound only — package installs"],
      detail: {
        what: "Optional egress path for public package installs (PyPI/Maven/npm). Outbound only. Removable if you mirror packages internally.",
        owner: "network", repo: "network/" } },

    // The host-project half of the creator grant (a separate per-project custom role),
    // held by the same workspace-creator SA that lives in the service project.
    { id: "crole_host", step: "2.2", x: 895, y: 463, w: 260, h: 82, title: "Creator role · host",
      lines: ["Read-only settings validation"],
      identity: ["IDENTITY", "held by the workspace-creator SA"],
      detail: {
        what: "Read-only custom role on the HOST project. It lets the workspace-creator SA validate host-network settings during workspace creation — it grants no create/modify power.",
        owner: "network",
        role: "lpw.databricks.workspace.creator.host.v2",
        perms: ["compute.forwardingRules.get", "compute.forwardingRules.list", "compute.networks.get", "compute.projects.get", "compute.subnetworks.get", "compute.subnetworks.getIamPolicy", "iam.roles.get", "resourcemanager.projects.get", "resourcemanager.projects.getIamPolicy", "serviceusage.services.get", "serviceusage.services.list"],
        repo: "network/creator-roles.tf" } },
    { id: "frontendpsc", step: "2.2", x: 905, y: 258, w: 240, h: 95, title: "Frontend PSC endpoint",
      lines: ["Workspace UI / API"], pill: "psc",
      detail: {
        what: "The consumer PSC endpoint for front-end traffic: a forwarding rule to a reserved private IP that connects to the plproxy attachment.",
        owner: "network",
        conn: ["Carries Workspace UI / API · TLS 443", "PENDING at 2.2 → ACCEPTED at 2.4"],
        repo: "network/" } },
    { id: "backendpsc", step: "2.2", x: 905, y: 365, w: 240, h: 80, title: "Backend PSC endpoint",
      lines: ["SCC relay"], pill: "psc",
      detail: {
        what: "The consumer PSC endpoint for the secure cluster connectivity relay: a forwarding rule to a reserved private IP that connects to the ngrok attachment.",
        owner: "network",
        conn: ["Carries SCC relay · TCP 6666", "PENDING at 2.2 → ACCEPTED at 2.4"],
        repo: "network/" } },
    // Workspace-SA network operator role — granted at 2.6, lives on the host node subnet.
    // deployOnly so it doesn't collide with the runtime VMs that fill this subnet in tabs 2/3.
    { id: "netrole", step: "2.6", x: 366, y: 450, w: 345, h: 66, title: "Workspace operator network role", deployOnly: true,
      lines: ["subnetworks.get / use (node subnet)"],
      identity: "IDENTITY · granted to the WS SA · node subnet",
      detail: {
        what: "Custom role on the HOST project, granted to the Workspace SA in step 2.6, that lets it place cluster VMs on this shared node subnet across the VPC boundary.",
        owner: "network",
        role: "lpw.databricks.network.role.v2",
        permsLabel: " (use the node subnet)",
        perms: ["compute.subnetworks.get", "compute.subnetworks.use"],
        repo: "post-workspace/iam.tf" } },

    // Node subnet — runtime VMs (tabs 2/3)
    { id: "drivervm", step: "run", x: 370, y: 452, w: 220, h: 86, title: "Driver VM",
      lines: ["Runtime + Photon"],
      detail: {
        what: "The cluster driver in the private node subnet. Runs the Databricks Runtime and the Photon vectorized engine on CMEK-encrypted disks.",
        conn: ["Runs as the Compute SA (or a custom Cluster SA) — not the Workspace SA"] } },
    { id: "execvm", step: "run", x: 610, y: 452, w: 220, h: 86, title: "Executor VMs × N",
      lines: ["Spark executors (autoscaling)"],
      detail: {
        what: "Autoscaling Spark executors running Photon on CMEK-encrypted disks in the node subnet. They do the actual data scan.",
        conn: ["Run as the Compute SA (or a custom Cluster SA)", "Read Mail data as the vended UC storage-credential SA — never their own SA"] } },

    // Service project
    // The workspace-creator SA lives in the service project (bhavink convention). It is
    // granted TWO read-only per-project custom roles — this service role, plus the host
    // role (separate box in the host project). Those two roles are its read access.
    { id: "creatorsa", step: "2.1", x: 790, y: 618, w: 370, h: 74, title: "Workspace-creator SA", accent: true,
      lines: ["Impersonated to create the workspace (2.4)"],
      identity: "IDENTITY · holds the two read-only creator roles",
      detail: {
        what: "The identity that creates the workspace. It is registered as a Databricks account admin and impersonated in phase 1 (2.4). It holds only the two read-only creator roles — it cannot create or modify GCP resources.",
        owner: "foundation",
        extra: [
          { label: "Roles held", body: "Creator role · service (2.1) + Creator role · host (2.2). Both read-only." },
          { label: "How Databricks acts as it", body: "Your runner impersonates it (<code>serviceAccountTokenCreator</code>) to mint two short-lived Google tokens for the create call: an <strong>ID token</strong> (identity) and an <strong>OAuth access token</strong> in the <code>X-Databricks-GCP-SA-Access-Token</code> header. Databricks spends that access token to call your GCP APIs as this SA, then discards it — no key, no standing grant." } ],
        conn: ["SA: <code>databricks_account_admin_sa</code>", "Home project: your choice — it can be placed in the service project (not mandated by Databricks)", "Not the Workspace SA (minted in 2.4)"] } },
    { id: "crole_svc", step: "2.1", x: 350, y: 600, w: 370, h: 76, title: "Creator role · service",
      lines: ["Read-only settings validation"],
      identity: "IDENTITY · held by the workspace-creator SA",
      detail: {
        what: "Read-only custom role on the SERVICE project. It lets the workspace-creator SA validate service-project settings during workspace creation — no create/modify power.",
        owner: "foundation",
        role: "lpw.databricks.workspace.creator.service.v2",
        perms: ["cloudkms.cryptoKeys.getIamPolicy", "compute.projects.get", "iam.roles.get", "iam.serviceAccounts.get", "iam.serviceAccounts.getIamPolicy", "resourcemanager.projects.get", "resourcemanager.projects.getIamPolicy", "serviceusage.services.get", "serviceusage.services.list"],
        repo: "service-project/creator-roles.tf" } },
    // Workspace-SA operator roles — created + granted to the Workspace SA at 2.5.
    { id: "projrole", step: "2.5", x: 350, y: 778, w: 370, h: 48, title: "Workspace operator project role",
      lines: [],
      identity: "IDENTITY · granted to the WS SA · read + actAs",
      detail: {
        what: "Custom role on the service project, created and granted to the Workspace SA in step 2.5. Project-wide read + actAs — broad but harmless (no create/modify).",
        owner: "iam",
        role: "lpw.databricks.project.role.v2",
        permsLabel: " (read + actAs)",
        perms: ["compute.disks.list", "compute.globalOperations.list", "compute.instances.list", "compute.regionOperations.list", "compute.regions.get", "compute.reservations.get", "compute.reservations.list", "compute.spotAssistants.get", "compute.zoneOperations.list", "compute.zones.get", "compute.zones.list", "iam.serviceAccounts.actAs", "resourcemanager.projects.get", "serviceusage.quotas.get", "serviceusage.services.list", "storage.buckets.list"],
        repo: "workspace-sa-roles/roles.tf" } },
    { id: "resrole", step: "2.5", x: 350, y: 840, w: 370, h: 48, title: "Workspace operator resource role",
      lines: [],
      identity: "IDENTITY · granted to the WS SA · creates storage + VMs",
      detail: {
        what: "Custom role on the service project, created and granted to the Workspace SA in step 2.5. Carries the create/manage permissions that let the SA build the workspace's disks, instances, and buckets at finalize (2.8).",
        owner: "iam",
        role: "lpw.databricks.resource.role.v2",
        permsLabel: " (create / manage)",
        perms: ["compute.disks.create", "compute.disks.delete", "compute.disks.get", "compute.disks.resize", "compute.disks.setLabels", "compute.disks.update", "compute.disks.use", "compute.disks.useReadOnly", "compute.instances.attachDisk", "compute.instances.create", "compute.instances.delete", "compute.instances.detachDisk", "compute.instances.get", "compute.instances.getGuestAttributes", "compute.instances.getSerialPortOutput", "compute.instances.setLabels", "compute.instances.setMetadata", "compute.instances.setServiceAccount", "compute.instances.setTags", "compute.instances.update", "storage.buckets.create", "storage.buckets.delete", "storage.buckets.get", "storage.buckets.getIamPolicy", "storage.buckets.setIamPolicy", "storage.buckets.update", "storage.multipartUploads.abort", "storage.multipartUploads.create", "storage.multipartUploads.list", "storage.multipartUploads.listParts", "storage.objects.create", "storage.objects.delete", "storage.objects.get", "storage.objects.list", "storage.objects.update"],
        extra: [ { label: "IAM condition — scoped to this workspace", body: "Bound project-wide but limited by an IAM condition to resources whose names carry both <code>databricks</code> and this workspace's id, so the SA can only touch this workspace's own buckets/disks/instances." } ],
        repo: "workspace-sa-roles/roles.tf" } },
    { id: "computesa", step: "2.1", x: 350, y: 690, w: 370, h: 74, title: "Compute SA", accent: true,
      lines: ["The VMs' runtime identity"],
      identity: "IDENTITY · not the launcher · minimal perms",
      detail: {
        what: "The runtime identity the cluster VMs actually run as — minimal permissions, not the launcher. An optional custom Cluster SA can override it per cluster.",
        owner: "foundation",
        conn: ["Default: <code>databricks-compute@&lt;svc-project&gt;</code> (GCE default SA)", "Exists from service-project creation (2.1) — created with Compute Engine"] } },
    { id: "kms", step: "2.3", x: 350, y: 968, w: 370, h: 52, title: "Cloud KMS — CMEK key",
      lines: ["Customer-managed encryption key"],
      detail: {
        what: "The customer keyring + key that encrypts the workspace. Two use cases: STORAGE (buckets/disks) and MANAGED_SERVICES (control-plane data).",
        owner: "security",
        extra: [
          { label: "STORAGE · granted 2.3", body: "encrypt/decrypt to the service project's Google compute-system + gs-project-accounts agents." },
          { label: "MANAGED_SERVICES · granted 2.7", body: "<code>cryptoKeyEncrypterDecrypter</code> to the Workspace SA." } ],
        repo: "cmek/ · cmek-workspace-grant/" } },
    { id: "wsbuckets", step: "2.8", x: 350, y: 902, w: 370, h: 52, title: "Workspace storage",
      lines: ["System data + DBFS root (CMEK)"],
      detail: {
        what: "The workspace's own GCS buckets and GCE disks — system data and the DBFS root — created by the Workspace SA at finalize (2.8). All CMEK-encrypted (STORAGE).",
        owner: "data" } },

    // Mail data projects (existing context)
    { id: "datalake", step: "0", x: 790, y: 745, w: 370, h: 82, title: "GCS — data lake (read-only)",
      lines: ["Yahoo Mail data"],
      detail: {
        what: "Existing Yahoo Mail data. The workspace reads it read-only, governed by Unity Catalog and the VPC-SC ingress gate.",
        conn: ["Read as the vended UC storage-credential SA (objectViewer + legacyBucketReader)"] } },
    { id: "analytics", step: "0", x: 790, y: 837, w: 370, h: 82, title: "GCS — analytics (read-write)",
      lines: ["Benchmark outputs"],
      detail: {
        what: "A PoC bucket the workspace writes benchmark outputs to, read-write, governed by Unity Catalog.",
        conn: ["Written as the vended UC storage-credential SA"] } },
    { id: "bigquery", step: "0", x: 790, y: 929, w: 370, h: 60, title: "BigQuery",
      lines: ["Yahoo Mail datasets"],
      detail: {
        what: "Existing Yahoo Mail BigQuery datasets, queried through the governed data path." } },

    // Public internet
    { id: "pkgrepos", step: "0", x: 1265, y: 1005, w: 350, h: 68, title: "Package repos",
      lines: ["PyPI · Maven · npm"],
      detail: {
        what: "Public package registries for library installs, reachable outbound via Cloud NAT. Optional if you mirror packages internally.",
        conn: ["Outbound only, via Cloud Router + NAT"] } }
  ];

  /* ---------------- persistent deployment "grant" edges ---------------- */
  // grant edges from the Workspace SA into the perimeter. Routed via the right gap +
  // bottom corridor so they never cross the Yahoo Mail data projects frame.
  var edges = [
    // Workspace-SA operator grants: accumulate 2.5 → 2.7, then all clear at 2.8 (RUNNING).
    { id: "e25a", step: "2.5", until: "2.7", d: "M1265,198 H1232 V1076 H308 V802 H350", label: "2.5 · project role", lx: 320, ly: 802, vertical: true },
    { id: "e25b", step: "2.5", until: "2.7", d: "M1265,212 H1225 V1048 H758 V864 H720", label: "2.5 · resource role", lx: 760, ly: 864, vertical: true },
    { id: "e26", step: "2.6", until: "2.7", d: "M1265,235 H1200 V552 H620 V516", label: "2.6 · network role → WS SA", lx: 770, ly: 548 },
    { id: "e27", step: "2.7", until: "2.7", d: "M1265,262 H1240 V1062 H535 V1020", label: "2.7 · CMEK MANAGED_SERVICES → WS SA", lx: 600, ly: 1082 },
    // data access (step 3): storage credentials + external locations wired to their buckets.
    { id: "e_sc_ro", step: "3", until: "3", color: "#1baf7a", marker: "a", d: "M1280,738 H1240 V760 H1160", label: "objectViewer", lx: 1240, ly: 740, vertical: true },
    { id: "e_el_ro", step: "3", until: "3", color: "#1baf7a", marker: "a", d: "M1280,798 H1226 V802 H1160", label: "" },
    { id: "e_sc_rw", step: "3", until: "3", color: "#2a78d6", marker: "b", d: "M1280,858 H1240 V866 H1160", label: "objectAdmin", lx: 1240, ly: 838, vertical: true },
    { id: "e_el_rw", step: "3", until: "3", color: "#2a78d6", marker: "b", d: "M1280,918 H1226 V902 H1160", label: "" }
  ];

  /* ---------------- VPC-SC ingress points (blinking markers ON the perimeter border) ----------------
     Each marks where a Databricks-owned identity crosses INTO Yahoo's VPC-SC perimeter to reach a
     protected resource. Clickable for detail (incl. source-pinning). Shown from their step onward. */
  var ingress = [
    { id: "ing_ws", step: "2.4", x: 1210, y: 626, title: "VPC-SC ingress · workspace",
      detail: {
        what: "The VPC-SC ingress rule that admits Databricks into your perimeter to create, validate, and run the workspace. These calls originate from Databricks' control-plane projects (outside the perimeter), so VPC-SC blocks them unless the perimeter admits them — even though IAM allows them.",
        extra: [
          { label: "Identity — pin the specific SAs (least-privilege)", body: "Name the two SAs that actually hold roles: the <strong>workspace-creator SA</strong> (read-only validation, 2.4 — Databricks bears its access token) and the <strong>Workspace SA</strong> (build at 2.8 + runtime — added once 2.4 mints and returns it)." },
          { label: "Source · during creation ONLY (temporary)", body: "Add <strong>only the us-central1 control-plane VPC host project numbers</strong> (GCP region reference) — Databricks marks these “Only required for workspace creation” (account-level provisioning routes through us-central1). Added on top of the standing rule, then removed once the workspace exists." },
          { label: "Into", body: "the host + service projects · <code>storage</code>, <code>compute</code>, <code>cloudkms</code>, <code>serviceusage</code>. VPC-SC requires BOTH identity and source to match (AND)." } ],
        conn: ["Admits: 2.4 validation (as the workspace-creator SA) · 2.7 CMEK ops + 2.8 build + runtime VM launch (as the Workspace SA)"],
        note: "In this playbook the perimeter is customer-supplied, so this ingress is a prerequisite set on your existing perimeter — not created by workspace-setup/." } },
    { id: "ing_ro", step: "3", x: 1210, y: 760, title: "VPC-SC ingress · data lake (RO)",
      detail: {
        what: "Admits the read-only vended UC storage-credential SA to the data-lake bucket over the Storage API — a fourth guard on top of UC + IAM + the credential.",
        extra: [
          { label: "Identity", body: "the RO storage credential's vended Databricks GCP SA." },
          { label: "Methods", body: "read only — <code>objects.get</code> / <code>objects.list</code>." },
          { label: "Source-pinned to", body: "Databricks control-plane project numbers — plus serverless-compute project numbers, so serverless can read too." } ],
        repo: "data-access/catalog-readonly.tf" } },
    { id: "ing_rw", step: "3", x: 1210, y: 866, title: "VPC-SC ingress · analytics (RW)",
      detail: {
        what: "Admits the read-write vended UC storage-credential SA to the analytics bucket over the Storage API.",
        extra: [
          { label: "Identity", body: "the RW storage credential's vended Databricks GCP SA." },
          { label: "Methods", body: "all storage methods (read + write)." },
          { label: "Source-pinned to", body: "Databricks control-plane + serverless-compute project numbers." } ],
        repo: "data-access/catalog-readwrite.tf" } }
  ];

  // PSC "wires": consumer endpoint → producer service attachment. Dashed/pending when
  // the endpoints are first created (2.2); solid once registered → ACCEPTED (2.4).
  var pscWires = [
    { id: "wf", d: "M1145,305 H1205 V332 H1263" },
    { id: "wb", d: "M1145,405 H1205 V432 H1263" }
  ];

  /* ---------------- deployment steps ---------------- */
  var steps = [
    { id: "0", label: "Starting point", short: "Starting Point", team: null,
      narrative: "What already exists before the build. Yahoo's VPC-SC perimeter and Shared-VPC host project are long-standing. On the Databricks side (outside the perimeter) the region's PSC service attachments (plproxy, ngrok), the regional control plane, and the Account API already run. The Mail data lake and BigQuery exist and are governed later.",
      privileges: [], creates: [],
      note: "Four service accounts to keep straight: Workspace SA (launcher, control-plane-owned), Compute SA (what the VMs run as), optional Cluster SA (custom per-cluster), and the vended UC storage-credential SA (governed reads)." },

    { id: "2.1", label: "Create service project", short: "Service project", team: "foundation", repo: "service-project/",
      narrative: "Cloud Foundation creates the service project (the tenant for this one workspace), enables its APIs, attaches it to the existing Shared VPC host, and provisions the GCS/compute service agents — including the Compute SA (GCE default) the cluster VMs will run as. It also defines the read-only workspace-creator role and grants it to the creator SA on the service project.",
      privileges: ["resourcemanager.projectCreator", "billing.user", "compute.xpnAdmin", "resourcemanager.projectIamAdmin", "serviceusage.serviceUsageAdmin", "iam.roleAdmin"],
      creates: ["service", "creatorsa", "computesa", "crole_svc"],
      creatLabel: ["Service project", "Workspace-creator SA", "Compute SA (GCE default)", "Creator role — service, read-only (held by the SA)"] },

    { id: "2.2", label: "Create network", short: "Network", team: "network", repo: "network/",
      narrative: "Network Engineering builds the private landing zone inside the host project: VPC + node subnet (NPIP, PGA on) + PSC subnet, firewall, Cloud Router/NAT, the private DNS zone (zone only — records come in 2.6), and the two PSC endpoints, which come up PENDING. It also grants the read-only creator role on the host project.",
      privileges: ["compute.networkAdmin", "compute.securityAdmin", "dns.admin", "iam.roleAdmin"],
      creates: ["dnszone", "routernat", "pscsubnet", "frontendpsc", "backendpsc", "nodesubnet", "crole_host"],
      creatLabel: ["VPC + node/PSC subnets", "Cloud Router + NAT (optional)", "Private DNS zone (no records yet)", "Frontend + Backend PSC endpoints (PENDING)", "Creator role — host, read-only (held by the SA)"] },

    { id: "2.3", label: "CMEK key", short: "CMEK", team: "security", repo: "cmek/",
      narrative: "Cloud Security creates the CMEK keyring + key in the service project and grants encrypt/decrypt to the service project's Google-managed compute-system and gs-project-accounts agents — the STORAGE use case only. The MANAGED_SERVICES grant to the Workspace SA waits for 2.7.",
      privileges: ["cloudkms.admin  (service project)"],
      creates: ["kms"], creatLabel: ["CMEK key (STORAGE agent grants)"] },

    { id: "2.4", label: "Create workspace — PHASE 1", short: "Workspace (PROVISIONING)", team: "data", repo: "workspace/ (finalize=false)",
      narrative: "Data Platform, with the workspace-creator SA, registers the CMEK key, the two PSC endpoints (which flips them PENDING → ACCEPTED), the private access settings, and the network config — then creates the workspace paused in PROVISIONING. Databricks mints and returns the Workspace SA without building any GCS/GCE yet.",
      privileges: ["Databricks account admin", "read-only creator roles (2.1 + 2.2)"],
      creates: ["wssa"], creatLabel: ["Workspace SA (minted, returned)", "PSC endpoints → ACCEPTED", "Private access settings · network config"],
      changed: ["frontendpsc", "backendpsc"],
      states: { frontendpsc: "ACCEPTED", backendpsc: "ACCEPTED", wssa: "workspace: PROVISIONING" },
      flows: ["v_net", "v_svc", "v_cmek"], pulse: ["service", "kms"],
      substep: "Sub-step: this read-only validation runs AS the workspace-creator SA (impersonated) — holding its two creator roles (2.1 service + 2.2 host), it reads the service project, the host network/PSC, and the CMEK key to validate settings before anything is created. Only read access is needed at creation time; the actual resource build (2.8) runs as the Workspace SA." },

    { id: "2.5", label: "Workspace-SA operator roles", short: "Operator roles", team: "iam", repo: "workspace-sa-roles/",
      narrative: "Cloud IAM defines and grants the Project role and the workspace-scoped Resource role to the Workspace SA on the service project. The Resource role carries storage.buckets.create / compute.instances.create — the permissions that let the SA build the workspace's storage and VMs — scoped by an IAM condition to this workspace's resources.",
      privileges: ["iam.roleAdmin  (service project)", "resourcemanager.projectIamAdmin  (service project)"],
      creates: ["projrole", "resrole"], edges: ["e25a", "e25b"], creatLabel: ["Project role + Resource role → Workspace SA"] },

    { id: "2.6", label: "Post-workspace config", short: "Network role + DNS", team: "network", repo: "post-workspace/",
      narrative: "Network Engineering grants the Workspace SA the custom network role (subnetworks.get/use) on the node subnet so it can place VMs across the Shared-VPC boundary, and writes the four DNS A-records into the zone so workspace hostnames resolve to the private PSC IPs.",
      privileges: ["compute.networkAdmin", "dns.admin", "iam.roleAdmin"],
      creates: ["netrole"], changed: ["dnszone"], edges: ["e26"], creatLabel: ["Network role → Workspace SA (node subnet)", "4 DNS A-records"],
      states: { dnszone: "records" } },

    { id: "2.7", label: "MANAGED_SERVICES CMEK grant", short: "CMEK grant", team: "security", repo: "cmek-workspace-grant/",
      narrative: "Cloud Security grants the Workspace SA cryptoKeyEncrypterDecrypter on the CMEK key — the MANAGED_SERVICES half — so control-plane data (notebook source, results, secrets, SQL history) is encrypted with the customer key.",
      privileges: ["cloudkms.admin  (service project)"],
      creates: [], changed: ["kms"], edges: ["e27"], creatLabel: ["CMEK encrypt/decrypt → Workspace SA"] },

    { id: "2.8", label: "Finalize — PHASE 2", short: "Workspace RUNNING", team: "data", repo: "workspace/ (finalize=true)",
      narrative: "Data Platform re-applies with finalize=true. expected_workspace_status flips to RUNNING; the now-authorized Workspace SA provisions the workspace GCS buckets + GCE disks (CMEK-encrypted). The workspace is assigned to the metastore and reaches RUNNING.",
      privileges: ["Databricks account admin"],
      creates: ["wsbuckets"], changed: ["wssa"], hideEdges: true, creatLabel: ["Workspace GCS buckets + GCE disks", "Workspace → RUNNING"],
      states: { wssa: "workspace: RUNNING" } },

    { id: "3", label: "Data access — UC catalogs", short: "Data access", team: "data", repo: "data-access/",
      narrative: "Data Platform — with the bucket owners and Cloud/Network Security — wires the running workspace to data through Unity Catalog. Two storage credentials are created, each generating its own Databricks GCP SA: the read-only credential gets objectViewer + legacyBucketReader on the existing data-lake bucket; the read-write credential gets objectAdmin on a new analytics bucket. Each SA is admitted by a VPC-SC ingress rule (read-only: read methods; read-write: all) and exposed as an external location.",
      privileges: ["storage IAM admin (bucket owners)", "accesscontextmanager.policyAdmin (perimeter)"],
      creates: ["uc", "sc_ro", "sc_rw", "el_ro", "el_rw"], changed: ["datalake", "analytics"], edges: ["e_sc_ro", "e_el_ro", "e_sc_rw", "e_el_rw"],
      creatLabel: ["2 storage credentials (RO + RW)", "2 external locations (RO + RW)", "GCS grants: RO objectViewer · RW objectAdmin", "VPC-SC ingress rules (RO reads · RW all)"] },

    { id: "end", label: "End state — least privilege", short: "End state", team: null,
      narrative: "The workspace is RUNNING. The bootstrap identity is now torn down: the workspace-creator SA and its two read-only creator roles (service + host) are deleted — they were only needed to create the workspace. What remains is the least-privilege steady state — the Workspace SA with its operator roles, the Compute SA, and the CMEK key.",
      privileges: [], creates: [], hideEdges: true,
      deletes: ["creatorsa", "crole_svc", "crole_host"],
      delLabel: ["Workspace-creator SA", "Creator role · service", "Creator role · host"],
      note: "Least-privilege hygiene: no standing account-admin creator identity remains after the workspace is built." }
  ];

  /* ---------------- flows (tabs 2 & 3) ---------------- */
  var flows = {
    // cluster launch
    l1a:   { c: "#2a78d6", d: "M270,180 H872 V305 H901", m: "b", label: "L1 · clusters/create · TLS 443", lx: 571, ly: 180, cross: [[300, 180, "B1"]] },
    l1b:   { c: "#2a78d6", d: "M1145,305 H1205 V332 H1263", m: "b", label: "", lx: 1180, ly: 300 },
    l2:    { c: "#eb6834", d: "M1265,515 H830", m: "o", label: "L2 · GCE: launch VMs — as the Workspace SA", lx: 1047, ly: 515, cross: [[1210, 515, "B6"]] },
    l2sa:  { c: "#eb6834", dash: "6 4", d: "M1265,655 H735 V727 H720", m: "o", label: "assigns Compute SA as VM identity", lx: 975, ly: 655 },
    boot:  { c: "#eb6834", dash: "6 4", d: "M480,560 V540", m: "o", label: "boot Runtime + Photon", lx: 545, ly: 556 },
    tunnel:{ c: "#c3c2b7", dash: "4 3", d: "M450,420 V393", m: "g", label: "resolve tunnel.<region>", lx: 462, ly: 410 },
    l3:    { c: "#eb6834", d: "M860,505 H882 V405 H901", m: "o", label: "L3 · 6666", lx: 874, ly: 470 },
    b3:    { c: "#eb6834", d: "M1145,405 H1205 V432 H1263", m: "o", label: "B3", lx: 1180, ly: 400, cross: [[1205, 405, "B3"]] },
    // notebook runtime
    n1:    { c: "#2a78d6", d: "M270,180 H872 V305 H901", m: "b", label: "F1 · notebook command · TLS 443", lx: 571, ly: 180, cross: [[300, 180, "B1"]] },
    n1b:   { c: "#2a78d6", d: "M1145,305 H1205 V332 H1263", m: "b", label: "", lx: 1180, ly: 300 },
    n2:    { c: "#eb6834", d: "M860,470 H884 V300 H901", m: "o", label: "F4 · UC metadata + token · 443", lx: 690, ly: 444 },
    f5:    { c: "#eb6834", dash: "6 4", d: "M860,525 H872 V405 H901", m: "o", label: "F5 · SCC relay · 6666", lx: 690, ly: 592 },
    f7:    { c: "#1baf7a", d: "M728,538 V745 H784", m: "a", label: "F7 · read (UC RO SA)", lx: 515, ly: 690, cross: [[786, 745, "ingress"]] },
    f8:    { c: "#1baf7a", d: "M745,538 V846 H784", m: "a", label: "F8 · write (UC RW SA)", lx: 515, ly: 712, cross: [[786, 846, "ingress"]] },
    ret:   { c: "#2a78d6", dash: "5 4", d: "M901,320 H860 V472 H832", m: "b", label: "results → analyst (nothing data-bearing via control plane)", lx: 690, ly: 700 },
    // 2.4 read-only "verify settings" sub-animation (Account API, via the creator role)
    v_net:  { c: "#8a8880", dash: "5 4", d: "M1265,610 H1216 V332 H1149", m: "g", label: "verify · network / PSC (read-only)", lx: 1120, ly: 600 },
    v_svc:  { c: "#8a8880", dash: "5 4", d: "M1265,640 H1210 V1068 H648 V1040", m: "g", label: "verify · service project (read-only)", lx: 860, ly: 1063 },
    v_cmek: { c: "#8a8880", dash: "5 4", d: "M1265,655 H1200 V1078 H318 V994 H350", m: "g", label: "verify · CMEK (read-only)", lx: 430, ly: 1088 }
  };

  var launchStages = [
    { id: "L1", title: "L1 · Analyst starts a cluster", team: "data",
      desc: "POST /api/2.x/clusters/create over TLS 443 crosses the perimeter and the frontend PSC wire to the control-plane cluster manager. Auth = Okta session / PAT.",
      flows: ["l1a", "l1b"], focus: ["admin", "frontendpsc", "plproxy", "controlplane"] },
    { id: "L2", title: "L2 · Cluster manager launches VMs", team: "data",
      desc: "Acting AS the Workspace SA (control-plane-owned launcher), the cluster manager calls the GCE API to create driver + executor VMs in the service project with CMEK-encrypted disks (crosses B6). It assigns the Compute SA as the VMs' identity — the VMs boot as the Compute SA, never the Workspace SA.",
      flows: ["l2", "l2sa", "boot"], reveal: ["drivervm", "execvm"], focus: ["controlplane", "computesa", "drivervm", "execvm", "kms"] },
    { id: "L3", title: "L3 · Cluster dials home (SCC relay)", team: "data",
      desc: "The VMs resolve tunnel.<region> in the private DNS zone, open TCP 6666 outbound to the backend endpoint → ngrok attachment (B3). The cluster registers and reaches RUNNING. No inbound path to the cluster exists.",
      flows: ["tunnel", "l3", "b3"], focus: ["drivervm", "backendpsc", "ngrok"], run: "RUNNING" }
  ];

  var notebookStages = [
    { id: "N1", title: "N1 · Analyst submits a command", team: "data",
      desc: "A notebook cell / SQL query goes from the analyst's browser over the frontend PSC wire (F1) to the workspace — the cluster is already RUNNING. Okta/OIDC auth happens on a back-channel, not on this wire.",
      flows: ["n1", "n1b"], reveal: ["drivervm", "execvm"], focus: ["admin", "frontendpsc", "plproxy", "controlplane"] },
    { id: "N2", title: "N2 · Driver gets context + a down-scoped token", team: "data",
      desc: "The running cluster calls the control plane over the frontend wire (F4) for UC metadata and a down-scoped storage token. The SCC relay (F5, TCP 6666) is the always-cluster-initiated control channel.",
      flows: ["n2", "f5"], focus: ["drivervm", "controlplane", "backendpsc"] },
    { id: "N3", title: "N3 · Governed read — Photon executes", team: "data",
      desc: "Executors read Mail data AS the vended UC storage-credential SA (never the VM's own SA), passing the VPC-SC ingress gate (identity-pinned, method-scoped, source-pinned). Photon runs the vectorized scan; results are written to the analytics bucket.",
      flows: ["f7", "f8"], focus: ["execvm", "datalake", "analytics"], pulse: ["drivervm", "execvm"] },
    { id: "N4", title: "N4 · Results return to the analyst", team: "data",
      desc: "Results return over the frontend PSC wire. The control plane sees metadata and query text (CMEK-encrypted) — never the data itself. The data never leaves the perimeter.",
      flows: ["ret"], focus: ["admin", "drivervm"] }
  ];

  /* ================= rendering ================= */
  var svg = document.getElementById("canvas");
  var elByNode = {}, elByContainer = {}, elByEdge = {}, elByFlow = {}, elByWire = {}, elByIngress = {}, BASE = {};

  function E(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function txt(parent, x, y, s, attrs) {
    var t = E("text", Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = s; return t;
  }

  function buildDefs() {
    var defs = E("defs", {}, svg);
    [["b", "#2a78d6"], ["o", "#eb6834"], ["a", "#1baf7a"], ["g", "#c3c2b7"]].forEach(function (p) {
      var m = E("marker", { id: "arr-" + p[0], viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
      E("path", { d: "M0,0 L10,5 L0,10 z", fill: p[1] }, m);
    });
  }

  function drawContainer(c) {
    var g = E("g", { class: "node container", "data-step": c.step, "data-id": c.id }, layC);
    BASE[c.id] = { x: c.x, y: c.y, w: c.w, h: c.h };
    var isPeri = c.cls === "perimeter", isSub = c.cls === "subframe";
    var cbox = E("rect", {
      class: "box", x: c.x, y: c.y, width: c.w, height: c.h, rx: 12,
      fill: isSub ? "none" : "#f9f9f7",
      stroke: isPeri ? "#d03b3b" : "#c9c8c0",
      "stroke-width": isPeri ? 2 : 1,
      "stroke-dasharray": isPeri ? "8 5" : (isSub ? "4 3" : "0")
    }, g);
    var lblFill = isPeri ? "#d03b3b" : "#898781";
    txt(g, c.x + 16, c.y + fs(16), c.label, { "font-size": fs(11.5), "font-weight": 700, "letter-spacing": "0.2", fill: lblFill });
    if (c.label2) txt(g, c.x + 16, c.y + fs(16) + fs(13.5), c.label2, { "font-size": fs(11.5), "font-weight": 700, "letter-spacing": "0.2", fill: lblFill });
    if (c.detail) {
      g.classList.add("clickable");
      cbox.setAttribute("pointer-events", "all");   // fill:none subframes ignore clicks otherwise
      g.addEventListener("click", function () { selectNode(c.id); });
    }
    elByContainer[c.id] = g;
  }

  function drawNode(n) {
    var g = E("g", { class: "node", "data-step": n.step, "data-id": n.id }, layN);
    BASE[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h };
    if (n.textOnly) {
      (n.lines || []).forEach(function (ln, i) {
        txt(g, n.x, n.y + i * fs(14), ln, { "font-size": fs(10.5), fill: "#52514e" });
      });
      elByNode[n.id] = g; return;
    }
    if (n.badge) {
      E("rect", { class: "box", x: n.x, y: n.y, width: n.w, height: n.h, rx: n.h / 2, fill: "#fff4ef", stroke: "#eb6834", "stroke-width": 1.2 }, g);
      txt(g, n.x + n.w / 2, n.y + n.h / 2 + 4, n.title, { "font-size": fs(10.5), "font-weight": 700, "text-anchor": "middle", fill: "#b3421f" });
      elByNode[n.id] = g; return;
    }
    E("rect", { class: "box", x: n.x, y: n.y, width: n.w, height: n.h, rx: 8,
      fill: "#ffffff", stroke: n.optional ? "#b98b00" : "#e1e0d9",
      "stroke-width": n.optional ? 1.5 : 1,
      "stroke-dasharray": n.optional ? "6 4" : "0" }, g);
    if (n.optional) {
      var ow = 68;
      E("rect", { x: n.x + n.w - ow - 8, y: n.y + n.h - 24, width: ow, height: 17, rx: 8.5, fill: "#fff7e6", stroke: "#e0b25a" }, g);
      txt(g, n.x + n.w - ow / 2 - 8, n.y + n.h - 12, "OPTIONAL", { "font-size": fs(9), "font-weight": 700, "text-anchor": "middle", fill: "#a86300" });
    }
    var tF = fs(14.5), lF = fs(12), tY = n.y + tF + 7, lH = lF + fs(3.4);
    txt(g, n.x + 13, tY, n.title, { "font-size": tF, "font-weight": 600, fill: "#0b0b0b" });
    (n.lines || []).forEach(function (ln, i) {
      txt(g, n.x + 13, tY + fs(16) + i * lH, ln, { "font-size": lF, fill: "#52514e" });
    });
    if (n.identity) {
      var idl = Array.isArray(n.identity) ? n.identity : [n.identity];   // identity may be 1 or 2 lines
      var iBase = n.y + n.h - 9 - (idl.length - 1) * fs(11.5);
      idl.forEach(function (s, i) { txt(g, n.x + 13, iBase + i * fs(11.5), s, { "font-size": fs(10.3), "font-weight": 600, fill: "#eb6834" }); });
    }
    if (n.pill) {
      var pg = E("g", { class: "statepill" }, g);
      var pr = E("rect", { x: n.x + n.w - 104, y: n.y + n.h - 27, width: 96, height: 19, rx: 9.5, fill: "#fff", stroke: "#c3c2b7" }, pg);
      var pt = txt(pg, n.x + n.w - 56, n.y + n.h - 14, "", { "font-size": fs(10.5), "font-weight": 700, "text-anchor": "middle", fill: "#898781" });
      g._pill = { rect: pr, text: pt, node: n };
    }
    g.classList.add("clickable");
    g.addEventListener("click", function () { selectNode(n.id); });
    elByNode[n.id] = g;
  }

  function drawIngress(ing) {
    var g = E("g", { class: "ingressg clickable", "data-step": ing.step, "data-id": ing.id }, layI);
    E("circle", { class: "ingress-halo", cx: ing.x, cy: ing.y, r: 11, fill: "#d03b3b" }, g);
    E("circle", { class: "ingress-dot", cx: ing.x, cy: ing.y, r: 9, fill: "#d03b3b", stroke: "#fff", "stroke-width": 2 }, g);
    g.addEventListener("click", function () { selectNode(ing.id); });
    elByIngress[ing.id] = g;
  }

  function drawEdge(e) {
    var ec = e.color || "#eb6834", em = e.marker || "o";
    var g = E("g", { class: "flowg", "data-step": e.step }, layE);
    E("path", { class: "flow", d: e.d, stroke: ec, "stroke-width": 1.6, "stroke-dasharray": "5 4",
      fill: "none", "marker-end": "url(#arr-" + em + ")", opacity: 0.8 }, g);
    if (e.label) {
      var lw = e.label.length * fs(6) + 16;
      var lg = e.vertical ? E("g", { transform: "rotate(-90 " + e.lx + " " + e.ly + ")" }, g) : g;
      E("rect", { x: e.lx - lw / 2, y: e.ly - fs(11), width: lw, height: fs(16.5), rx: 10, fill: e.color ? "#fff" : "#fff4ef", stroke: e.color ? ec : "#f4c7b3" }, lg);
      txt(lg, e.lx, e.ly, e.label, { "font-size": fs(10.5), "font-weight": 600, "text-anchor": "middle", fill: e.color ? ec : "#b3421f" });
    }
    elByEdge[e.id] = g;
  }

  function drawFlow(id) {
    var f = flows[id];
    var g = E("g", { class: "flowg", "data-flow": id }, layF);
    var p = E("path", { class: "flow draw", d: f.d, stroke: f.c, "stroke-width": 2.6, fill: "none",
      "marker-end": "url(#arr-" + f.m + ")" }, g);
    if (f.dash) p.setAttribute("stroke-dasharray", f.dash);
    // label
    if (f.label) {
      var lw = f.label.length * fs(6.1) + 16;
      E("rect", { x: f.lx - lw / 2, y: f.ly - fs(11.5), width: lw, height: fs(17), rx: 10, fill: "#fff", stroke: f.c }, g);
      txt(g, f.lx, f.ly, f.label, { "font-size": fs(11), "font-weight": 600, "text-anchor": "middle", fill: f.c });
    }
    // crossings
    (f.cross || []).forEach(function (cr) {
      E("rect", { x: cr[0] - 4.5, y: cr[1] - 4.5, width: 9, height: 9, transform: "rotate(45 " + cr[0] + " " + cr[1] + ")", fill: "#d03b3b" }, g);
    });
    elByFlow[id] = { g: g, path: p };
    return elByFlow[id];
  }

  function drawWire(w) {
    var g = E("g", { class: "flowg", "data-wire": w.id }, layW);
    var p = E("path", { class: "flow", d: w.d, fill: "none", "marker-end": "url(#arr-a)" }, g);
    elByWire[w.id] = { g: g, path: p };
  }
  function updateWires(maxIdx) {
    var on = maxIdx >= oi("2.2"), accepted = maxIdx >= oi("2.4");
    pscWires.forEach(function (w) {
      var e = elByWire[w.id]; if (!e) return;
      toggle(e.g, on);
      e.path.setAttribute("stroke", accepted ? "#1baf7a" : "#c3c2b7");
      e.path.setAttribute("stroke-width", accepted ? 2.2 : 1.6);
      e.path.setAttribute("stroke-dasharray", accepted ? "0" : "6 5");
      e.path.setAttribute("marker-end", accepted ? "url(#arr-a)" : "url(#arr-g)");
    });
  }

  // layers
  var layC, layE, layW, layN, layF, layI;
  function renderAll() {
    buildDefs();
    E("rect", { x: 0, y: 0, width: 1680, height: 1160, fill: "#fcfcfb" }, svg);
    layC = E("g", { id: "layC" }, svg);
    layE = E("g", { id: "layE" }, svg);
    layW = E("g", { id: "layW" }, svg);
    layN = E("g", { id: "layN" }, svg);
    layF = E("g", { id: "layF" }, svg);
    layI = E("g", { id: "layI" }, svg);   // VPC-SC ingress markers, on top
    containers.forEach(drawContainer);
    pscWires.forEach(drawWire);
    nodes.forEach(drawNode);
    edges.forEach(drawEdge);
    ingress.forEach(drawIngress);
  }

  /* ================= state ================= */
  var tab = "deploy";
  var idx = 0; // step/stage index within current tab

  function setPill(nodeId, kind) {
    var g = elByNode[nodeId]; if (!g || !g._pill) return;
    var t = g._pill.text, r = g._pill.rect;
    var map = {
      PENDING: ["#a86300", "#fff7e6", "#e0b25a", "PENDING"],
      ACCEPTED: ["#0b7a54", "#eafaf3", "#1baf7a", "ACCEPTED"],
      zoneonly: ["#898781", "#fff", "#c3c2b7", "zone only"],
      records: ["#0b7a54", "#eafaf3", "#1baf7a", "4 A-records"]
    };
    var m = map[kind]; if (!m) { t.textContent = ""; r.setAttribute("opacity", 0); return; }
    r.setAttribute("opacity", 1); r.setAttribute("fill", m[1]); r.setAttribute("stroke", m[2]);
    t.setAttribute("fill", m[0]); t.textContent = m[3];
  }

  // Workspace status shown as extra pill-like text on wssa
  function setWsStatus(text, running) {
    var g = elByNode.wssa; if (!g) return;
    if (!g._ws) {
      var wr = E("rect", { x: 1265 + 350 - 188, y: 180 + 6, width: 180, height: 19, rx: 9.5, fill: "#fff", stroke: "#c3c2b7" }, g);
      var wt = txt(g, 1265 + 350 - 98, 180 + 19, "", { "font-size": fs(10.5), "font-weight": 700, "text-anchor": "middle", fill: "#898781" });
      g._ws = { r: wr, t: wt };
    }
    if (!text) { g._ws.r.setAttribute("opacity", 0); g._ws.t.textContent = ""; return; }
    g._ws.r.setAttribute("opacity", 1);
    g._ws.r.setAttribute("fill", running ? "#eafaf3" : "#fff7e6");
    g._ws.r.setAttribute("stroke", running ? "#1baf7a" : "#e0b25a");
    g._ws.t.setAttribute("fill", running ? "#0b7a54" : "#a86300");
    g._ws.t.textContent = text;
  }

  function applyDeployStates(maxIdx) {
    // pills default
    var fe = maxIdx >= oi("2.4") ? "ACCEPTED" : (maxIdx >= oi("2.2") ? "PENDING" : null);
    setPill("frontendpsc", fe); setPill("backendpsc", fe);
    setPill("dnszone", maxIdx >= oi("2.2") ? (maxIdx >= oi("2.6") ? "records" : "zoneonly") : null);
    if (maxIdx >= oi("2.8")) setWsStatus("workspace: RUNNING", true);
    else if (maxIdx >= oi("2.4")) setWsStatus("workspace: PROVISIONING", false);
    else setWsStatus("", false);
  }

  function showDeployNodes(maxIdx) {
    containers.forEach(function (c) { toggle(elByContainer[c.id], oi(c.step) <= maxIdx && oi(c.step) >= 0); });
    nodes.forEach(function (n) {
      var vis = n.step !== "run" && oi(n.step) <= maxIdx && oi(n.step) >= 0;
      toggle(elByNode[n.id], vis);
    });
    // VPC-SC ingress markers blink only on their own step (2.4 / 3) — not before, after, or in runtime
    ingress.forEach(function (ing) { toggle(elByIngress[ing.id], oi(ing.step) === maxIdx); });
    // teardown: hide anything a step at/before maxIdx deletes (e.g. the End step removes the creator SA + its roles)
    for (var si = 0; si <= maxIdx && si < steps.length; si++) {
      (steps[si].deletes || []).forEach(function (id) { toggle(elByNode[id] || elByContainer[id], false); });
    }
    // grant edges show cumulatively from their step through their `until` step, then clear:
    // the WS-SA operator grants pile up 2.5→2.7 (all the perms this SA needs) and vanish at
    // 2.8; the data-access grants show at step 3. RUNNING / End show none.
    edges.forEach(function (e) { toggle(elByEdge[e.id], maxIdx >= oi(e.step) && maxIdx <= oi(e.until)); });
    updateWires(maxIdx);
  }

  function toggle(g, on, appear) {
    if (!g) return;
    if (on) { g.classList.add("show"); if (appear) { g.classList.remove("appear"); void g.offsetWidth; g.classList.add("appear"); } }
    else { g.classList.remove("show", "appear"); }
  }

  function clearFlows() {
    Object.keys(elByFlow).forEach(function (k) { elByFlow[k].g.remove(); delete elByFlow[k]; });
  }
  function clearFocus() {
    nodes.forEach(function (n) { if (elByNode[n.id]) elByNode[n.id].classList.remove("dim", "selected", "pulsing", "created"); });
    containers.forEach(function (c) { if (elByContainer[c.id]) elByContainer[c.id].classList.remove("dim", "selected", "created"); });
    ingress.forEach(function (ig) { if (elByIngress[ig.id]) elByIngress[ig.id].classList.remove("selected"); });
  }

  function animateFlow(id, delay) {
    var f = elByFlow[id] || drawFlow(id);
    f.g.classList.add("show");
    var len = f.path.getTotalLength();
    f.path.style.strokeDasharray = (flows[id].dash ? flows[id].dash : (len + " " + len));
    if (!flows[id].dash) {
      f.path.style.strokeDashoffset = len;
      setTimeout(function () { f.path.style.strokeDashoffset = 0; }, delay || 30);
    }
  }

  /* ---------- runtime tabs: show full deployed topology ---------- */
  function showFullTopology() {
    var max = ORDER.length - 1;
    showDeployNodes(max);
    applyDeployStates(max);
    // deploy-only annotations (e.g. the firewall note) would collide with runtime VMs
    nodes.forEach(function (n) { if (n.deployOnly && elByNode[n.id]) toggle(elByNode[n.id], false); });
    // setup-time grant edges are deployment-only; hide them under the runtime flows
    edges.forEach(function (e) { toggle(elByEdge[e.id], false); });
  }

  /* ================= tab drivers ================= */
  function renderRail(list, activeIdx, kind) {
    var ol = document.getElementById("stepList"); ol.innerHTML = "";
    list.forEach(function (s, i) {
      var li = document.createElement("li");
      li.className = "step-item" + (i === activeIdx ? " active" : "") + (i < activeIdx ? " done" : "");
      var badge = kind === "deploy" ? (s.id === "0" ? "•" : (s.id === "end" ? "✓" : s.id)) : s.id;
      var team = s.team ? TEAM[s.team].name : "";
      li.innerHTML = '<span class="step-badge">' + badge + '</span><span class="step-meta"><span class="step-name">' +
        (s.short || s.title) + '</span><span class="step-team">' + team + '</span></span>';
      li.addEventListener("click", function () { goto(i); });
      ol.appendChild(li);
    });
  }

  function panelDeploy(s) {
    var p = document.getElementById("panelBody");
    var team = s.team ? TEAM[s.team] : null;
    var h = '<div class="step-id">' + (s.id === "0" ? "Starting point" : (s.id === "end" ? "End state" : "Step " + s.id)) + '</div>';
    h += '<h2>' + s.label + '</h2>';
    if (team) h += '<span class="chip" style="background:' + team.color + '">' + team.name + '</span>';
    h += '<p>' + s.narrative + '</p>';
    if (s.delLabel && s.delLabel.length) {
      h += '<h3>Removed this step</h3><div>';
      s.delLabel.forEach(function (r) { h += '<span class="tag del">' + r + '</span>'; });
      h += '</div>';
    }
    if (s.privileges && s.privileges.length) {
      h += '<h3>Privileges in use</h3><div>';
      s.privileges.forEach(function (pv) { h += '<span class="tag priv">' + pv + '</span>'; });
      h += '</div>';
    }
    if (s.creatLabel && s.creatLabel.length) {
      h += '<h3>Created / changed this step</h3><div>';
      s.creatLabel.forEach(function (r) { h += '<span class="tag res">' + r + '</span>'; });
      h += '</div>';
    }
    if (s.substep) h += '<p class="note" style="border-color:#c3c2b7">' + s.substep + '</p>';
    if (s.repo) h += '<p class="note">Repo config: <code>' + s.repo + '</code></p>';
    if (s.note) h += '<p class="note">' + s.note + '</p>';
    p.innerHTML = h;
  }

  function panelStage(s) {
    var p = document.getElementById("panelBody");
    var team = s.team ? TEAM[s.team] : null;
    var h = '<div class="step-id">' + s.id + '</div><h2>' + s.title.replace(/^[LN]\d · /, "") + '</h2>';
    if (team) h += '<span class="chip" style="background:' + team.color + '">' + team.name + '</span>';
    h += '<p>' + s.desc + '</p>';
    p.innerHTML = h;
  }

  function focusNodes(ids) {
    if (!ids) return;
    nodes.forEach(function (n) {
      var g = elByNode[n.id]; if (!g || n.step === "run") { if (g) g.classList.remove("dim"); return; }
      if (g.classList.contains("show")) g.classList.toggle("dim", ids.indexOf(n.id) === -1);
    });
    ids.forEach(function (id) { if (elByNode[id]) elByNode[id].classList.remove("dim"); });
  }

  /* ---------- deployment ---------- */
  function setDeploy(i) {
    idx = Math.max(0, Math.min(steps.length - 1, i));
    clearFlows(); clearFocus();
    showDeployNodes(idx);
    applyDeployStates(idx);
    // appear-animate + green-highlight what this step creates; green-highlight what it changes
    var s = steps[idx];
    (s.creates || []).forEach(function (id) { var g = elByNode[id] || elByContainer[id]; toggle(g, true, true); if (g) g.classList.add("created"); });
    (s.changed || []).forEach(function (id) { var g = elByNode[id] || elByContainer[id]; if (g) g.classList.add("created"); });
    (s.edges || []).forEach(function (id) { toggle(elByEdge[id], true, true); });
    // pulse (orange) the components this step validates read-only (2.4 verify)
    (s.pulse || []).forEach(function (id) { var g = elByNode[id] || elByContainer[id]; if (g) g.classList.add("selected"); });
    // step-scoped action flows (e.g. 2.4 read-only verify) — animated, cleared on step change
    if (s.flows) { var d = 0; s.flows.forEach(function (fid) { animateFlow(fid, 90 + d); d += 220; }); }
    renderRail(steps, idx, "deploy");
    panelDeploy(s);
    updateControls(steps.length);
  }

  /* ---------- launch / notebook ---------- */
  function setStage(list, i, runningNodeId) {
    idx = Math.max(0, Math.min(list.length - 1, i));
    clearFlows(); clearFocus();
    showFullTopology();
    // reveal runtime nodes up to this stage; hide beyond
    var revealed = {};
    for (var s = 0; s <= idx; s++) (list[s].reveal || []).forEach(function (id) { revealed[id] = true; });
    ["drivervm", "execvm"].forEach(function (id) { toggle(elByNode[id], !!revealed[id], false); });
    // draw flows cumulatively; animate current stage
    var d = 0;
    for (var k = 0; k <= idx; k++) {
      (list[k].flows || []).forEach(function (fid) {
        if (k === idx) { animateFlow(fid, 60 + d); d += 260; }
        else { var f = drawFlow(fid); f.g.classList.add("show"); f.path.classList.remove("draw"); }
      });
    }
    var st = list[idx];
    if (st.run) { setPill("backendpsc", "ACCEPTED"); }
    if (st.pulse) st.pulse.forEach(function (id) { var g = elByNode[id]; if (g) g.classList.add("selected"); });
    focusNodes(st.focus);
    renderRail(list, idx, "stage");
    panelStage(st);
    updateControls(list.length);
  }

  /* ================= controls ================= */
  function currentList() { return tab === "deploy" ? steps : (tab === "launch" ? launchStages : notebookStages); }
  function goto(i) {
    if (tab === "deploy") setDeploy(i);
    else setStage(currentList(), i);
  }
  function updateControls(n) {
    document.getElementById("prevBtn").disabled = idx <= 0;
    document.getElementById("nextBtn").disabled = idx >= n - 1;
  }

  var playing = null;
  function stopPlay() { if (playing) { clearInterval(playing); playing = null; document.getElementById("playBtn").textContent = "▶ Play"; } }
  function play() {
    if (playing) { stopPlay(); return; }
    var n = currentList().length;
    if (idx >= n - 1) goto(0);
    document.getElementById("playBtn").textContent = "❚❚ Pause";
    playing = setInterval(function () {
      if (idx >= n - 1) { stopPlay(); return; }
      goto(idx + 1);
    }, 2600);
  }

  function setTab(t) {
    tab = t; stopPlay(); idx = 0;
    document.querySelectorAll(".tab").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === t); });
    document.getElementById("railTitle").textContent =
      t === "deploy" ? "Deployment steps" : (t === "launch" ? "Cluster launch" : "Notebook command");
    renderLegend();
    if (t === "deploy") setDeploy(0); else setStage(currentList(), 0);
  }

  function renderLegend() {
    var L = document.getElementById("legend");
    var sets = {
      deploy: [["line", "#d03b3b", "VPC-SC boundary", "8 5"], ["line", "#eb6834", "grant edge", "5 4"], ["dot", "#0b7a54", "created / changed this step"], ["dot", "#e0b25a", "pending"], ["ring", "#d03b3b", "VPC-SC ingress · click"]],
      launch: [["line", "#2a78d6", "user access"], ["line", "#eb6834", "control plane / launch"], ["line", "#c3c2b7", "DNS / boot", "4 3"], ["dot", "#d03b3b", "boundary crossing"], ["ring", "#d03b3b", "VPC-SC ingress · click"]],
      notebook: [["line", "#2a78d6", "user access"], ["line", "#eb6834", "control plane"], ["line", "#1baf7a", "data plane (governed read)"], ["dot", "#d03b3b", "VPC-SC crossing"], ["ring", "#d03b3b", "VPC-SC ingress · click"]]
    };
    L.innerHTML = "";
    sets[tab].forEach(function (it) {
      var s = document.createElement("span"); s.className = "lg";
      if (it[0] === "line") {
        var sw = document.createElement("span"); sw.className = "sw";
        sw.style.borderTopColor = it[1]; if (it[3]) sw.style.borderTopStyle = "dashed";
        s.appendChild(sw);
      } else if (it[0] === "ring") {
        var rg = document.createElement("span"); rg.className = "lgring"; rg.style.borderColor = it[1]; s.appendChild(rg);
      } else {
        var d = document.createElement("span"); d.className = "dot"; d.style.background = it[1]; s.appendChild(d);
      }
      var t = document.createElement("span"); t.textContent = it[2]; s.appendChild(t);
      L.appendChild(s);
    });
  }

  function selectNode(id) {
    nodes.forEach(function (n) { if (elByNode[n.id]) elByNode[n.id].classList.remove("selected"); });
    containers.forEach(function (c) { if (elByContainer[c.id]) elByContainer[c.id].classList.remove("selected"); });
    ingress.forEach(function (ig) { if (elByIngress[ig.id]) elByIngress[ig.id].classList.remove("selected"); });
    var g = elByNode[id] || elByContainer[id] || elByIngress[id]; if (g) g.classList.add("selected");
    var n = nodes.find(function (x) { return x.id === id; }) || containers.find(function (x) { return x.id === id; }) || ingress.find(function (x) { return x.id === id; });
    if (!n) return;
    var d = n.detail || {};
    var team = d.owner ? TEAM[d.owner] : null;
    var p = document.getElementById("panelBody");
    var h = '<div class="step-id">Resource</div><h2>' + (n.title || n.label) + '</h2>';
    if (team) h += '<span class="chip" style="background:' + team.color + '">' + team.name + '</span>';
    h += '<p>' + (d.what || (n.lines || []).join("<br>")) + '</p>';
    if (n.identity) h += '<p class="note" style="border-color:#f4c7b3;color:#b3421f">' + n.identity + '</p>';
    if (d.role) h += '<h3>Custom role</h3><p><code>' + d.role + '</code></p>';
    if (d.perms && d.perms.length) {
      h += '<h3>Permissions' + (d.permsLabel || ' · read-only') + '</h3><div>';
      d.perms.forEach(function (pm) { h += '<span class="tag priv">' + pm + '</span>'; });
      h += '</div>';
    }
    (d.extra || []).forEach(function (s) {
      h += '<h3>' + s.label + '</h3>';
      if (s.body) h += '<p>' + s.body + '</p>';
      if (s.items) { h += '<ul>'; s.items.forEach(function (it) { h += '<li>' + it + '</li>'; }); h += '</ul>'; }
    });
    if (d.conn && d.conn.length) {
      h += '<h3>Connectivity &amp; identity</h3><ul>';
      d.conn.forEach(function (c) { h += '<li>' + c + '</li>'; });
      h += '</ul>';
    }
    if (d.repo) h += '<p class="note">Repo config: <code>' + d.repo + '</code></p>';
    h += '<p class="muted">Appears: ' + (n.step === "run" ? "at cluster launch" : (n.step === "0" ? "already exists" : "step " + n.step)) + '</p>';
    p.innerHTML = h;
  }

  /* ================= init ================= */
  renderAll();
  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () { setTab(b.dataset.tab); });
  });
  document.getElementById("prevBtn").addEventListener("click", function () { stopPlay(); goto(idx - 1); });
  document.getElementById("nextBtn").addEventListener("click", function () { stopPlay(); goto(idx + 1); });
  document.getElementById("resetBtn").addEventListener("click", function () { stopPlay(); goto(0); });
  document.getElementById("playBtn").addEventListener("click", play);
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { stopPlay(); goto(idx + 1); }
    else if (e.key === "ArrowLeft") { stopPlay(); goto(idx - 1); }
  });

  /* ---------- zoom / pan ---------- */
  var baseVB = (function () { var a = svg.getAttribute("viewBox").split(/\s+/).map(Number); return { x: a[0], y: a[1], w: a[2], h: a[3] }; })();
  var vb = { x: baseVB.x, y: baseVB.y, w: baseVB.w, h: baseVB.h };
  var MINW = baseVB.w * 0.30; // max zoom-in ~3.3x
  function applyVB() { svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h); }
  function clampVB() {
    if (vb.w >= baseVB.w) vb.x = baseVB.x + (baseVB.w - vb.w) / 2;
    else vb.x = Math.max(baseVB.x, Math.min(vb.x, baseVB.x + baseVB.w - vb.w));
    if (vb.h >= baseVB.h) vb.y = baseVB.y + (baseVB.h - vb.h) / 2;
    else vb.y = Math.max(baseVB.y, Math.min(vb.y, baseVB.y + baseVB.h - vb.h));
  }
  function toSvg(cx, cy) { var p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function zoomBy(factor, cx, cy) {
    var nw = Math.max(MINW, Math.min(baseVB.w, vb.w / factor));
    var scale = nw / vb.w, nh = vb.h * scale;
    if (cx == null) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2; }
    vb.x = cx - (cx - vb.x) * scale; vb.y = cy - (cy - vb.y) * scale;
    vb.w = nw; vb.h = nh; clampVB(); applyVB();
  }
  function fitVB() { vb = { x: baseVB.x, y: baseVB.y, w: baseVB.w, h: baseVB.h }; applyVB(); }
  svg.addEventListener("wheel", function (e) { e.preventDefault(); var p = toSvg(e.clientX, e.clientY); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y); }, { passive: false });
  var panning = false, moved = false, last = null;
  svg.addEventListener("mousedown", function (e) { panning = true; moved = false; last = { x: e.clientX, y: e.clientY }; });
  window.addEventListener("mousemove", function (e) {
    if (!panning) return;
    var ctm = svg.getScreenCTM(); if (!ctm) return;
    var dx = (e.clientX - last.x) / ctm.a, dy = (e.clientY - last.y) / ctm.d;
    if (Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y) > 2) moved = true;
    vb.x -= dx; vb.y -= dy; clampVB(); applyVB(); last = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("mouseup", function () { panning = false; });
  // suppress node-click selection if the mouse was dragging (pan)
  svg.addEventListener("click", function (e) { if (moved) { e.stopPropagation(); moved = false; } }, true);
  document.getElementById("zoomIn").addEventListener("click", function () { zoomBy(1.3); });
  document.getElementById("zoomOut").addEventListener("click", function () { zoomBy(1 / 1.3); });
  document.getElementById("zoomFit").addEventListener("click", fitVB);

  /* ---------- hidden edit mode: ?edit=1 → drag / resize boxes + edit text ----------
     Then window.getLayout() (or the "Copy layout" button) returns, per changed box,
     the absolute { x, y, w, h, title, lines } (label for containers) to bake back into
     nodes[]/containers[]. Edges/flows still don't auto-follow — re-route those by hand. */
  var EDIT = /(?:^|[?&])edit(?:=1)?(?:&|$)/.test(location.search);
  var edits = {};                       // id -> { x,y,w,h,title,lines,label } (absolute; only changed fields)
  var nodeById = {}, containerById = {};
  nodes.forEach(function (n) { nodeById[n.id] = n; });
  containers.forEach(function (c) { containerById[c.id] = c; });

  window.getLayout = function () {
    var o = {};
    for (var id in edits) {
      var e = edits[id], keep = {};
      ["x", "y", "w", "h", "title", "lines", "label"].forEach(function (k) { if (e[k] != null) keep[k] = e[k]; });
      if (Object.keys(keep).length) o[id] = keep;
    }
    return o;
  };

  if (EDIT) {
    document.body.classList.add("editmode");
    var layEdit = E("g", { id: "layEdit" }, svg);   // outline + handles, on top of all

    // ---- edit UI: dialog docked in the header, to the left of the tabs ----
    var panel = document.createElement("div");
    panel.className = "editpanel";
    panel.innerHTML =
      '<h4 id="epTitle">EDIT · click a box</h4>' +
      '<textarea id="epText" rows="5" spellcheck="false" placeholder="first line = title · remaining lines = body" hidden></textarea>' +
      '<div class="dims" hidden>' +
      '<label>W <input id="epW" type="number" step="1"></label>' +
      '<label>H <input id="epH" type="number" step="1"></label>' +
      '<button id="epReset" type="button">Reset box</button>' +
      '</div>' +
      '<button id="copyLayout" type="button">Copy layout</button>';
    var topbar = document.querySelector(".topbar");
    topbar.insertBefore(panel, topbar.querySelector(".tabs"));
    var editFields = [].slice.call(panel.querySelectorAll("#epText, .dims"));
    function showFields(on) { editFields.forEach(function (el) { el.hidden = !on; }); }

    document.getElementById("copyLayout").addEventListener("click", function () {
      var s = JSON.stringify(window.getLayout(), null, 2);
      try { navigator.clipboard.writeText(s); } catch (e) {}
      window.prompt("Layout (also on clipboard). Paste this back:", s);
    });

    // ---- helpers ----
    function base(id) { return nodeById[id] || containerById[id]; }
    function cur(id) {
      var b = base(id), e = edits[id] || {};
      return {
        x: e.x != null ? e.x : b.x, y: e.y != null ? e.y : b.y,
        w: e.w != null ? e.w : b.w, h: e.h != null ? e.h : b.h
      };
    }
    // redraw a single box from base + edits, preserving its shown state, then re-handle
    function reflow(id) {
      if (nodeById[id]) {
        var g = elByNode[id], shown = g && g.classList.contains("show");
        if (g) g.remove();
        drawNode(Object.assign({}, nodeById[id], edits[id] || {}));
        if (shown) elByNode[id].classList.add("show");
      } else {
        var gc = elByContainer[id], shownc = gc && gc.classList.contains("show");
        if (gc) gc.remove();
        drawContainer(Object.assign({}, containerById[id], edits[id] || {}));
        if (shownc) elByContainer[id].classList.add("show");
      }
      if (sel === id) drawHandles(id);
    }

    // ---- selection + resize handles ----
    var sel = null, HR = 7;
    var ROLES = [
      ["nw", 0, 0, "nwse-resize"], ["n", .5, 0, "ns-resize"], ["ne", 1, 0, "nesw-resize"],
      ["e", 1, .5, "ew-resize"], ["se", 1, 1, "nwse-resize"], ["s", .5, 1, "ns-resize"],
      ["sw", 0, 1, "nesw-resize"], ["w", 0, .5, "ew-resize"]
    ];
    function drawHandles(id) {
      while (layEdit.firstChild) layEdit.removeChild(layEdit.firstChild);
      if (!id) return;
      var c = cur(id);
      E("rect", { class: "eoutline", x: c.x, y: c.y, width: c.w, height: c.h, rx: 6 }, layEdit);
      ROLES.forEach(function (r) {
        var hx = c.x + r[1] * c.w, hy = c.y + r[2] * c.h;
        var h = E("rect", { class: "ehandle", x: hx - HR, y: hy - HR, width: 2 * HR, height: 2 * HR, rx: 2, "data-role": r[0] }, layEdit);
        h.style.cursor = r[3];
      });
    }
    function selectBox(id) {
      sel = id; drawHandles(id);
      var b = base(id), e = edits[id] || {}, c = cur(id);
      showFields(true);
      document.getElementById("epTitle").textContent = id;
      var v;
      if (containerById[id]) v = (e.label != null ? e.label : b.label) || "";
      else if (b.textOnly) v = (e.lines != null ? e.lines : (b.lines || [])).join("\n");
      else v = [(e.title != null ? e.title : b.title) || ""].concat(e.lines != null ? e.lines : (b.lines || [])).join("\n");
      document.getElementById("epText").value = v;
      document.getElementById("epW").value = Math.round(c.w);
      document.getElementById("epH").value = Math.round(c.h);
    }
    function deselect() { sel = null; drawHandles(null); showFields(false); document.getElementById("epTitle").textContent = "EDIT · click a box"; }

    // ---- panel edits (live) ----
    document.getElementById("epText").addEventListener("input", function () {
      if (!sel) return;
      var b = base(sel), raw = this.value; edits[sel] = edits[sel] || {};
      if (containerById[sel]) edits[sel].label = raw.replace(/\n/g, " ");
      else if (b.textOnly) edits[sel].lines = raw.split("\n");
      else { var ls = raw.split("\n"); edits[sel].title = ls[0]; edits[sel].lines = ls.slice(1); }
      reflow(sel);
    });
    [["w", "epW"], ["h", "epH"]].forEach(function (p) {
      document.getElementById(p[1]).addEventListener("input", function () {
        if (!sel) return; var val = parseFloat(this.value); if (isNaN(val)) return;
        edits[sel] = edits[sel] || {}; edits[sel][p[0]] = Math.max(20, Math.round(val)); reflow(sel);
      });
    });
    document.getElementById("epReset").addEventListener("click", function () {
      if (!sel) return; delete edits[sel]; reflow(sel); selectBox(sel);
    });

    // ---- drag: move (box body) or resize (handle) ----
    var mode = null, dragId = null, startPt = null, startBox = null, role = null;
    svg.addEventListener("mousedown", function (e) {
      var handle = e.target.closest && e.target.closest(".ehandle");
      if (handle && sel) {
        mode = "resize"; dragId = sel; role = handle.getAttribute("data-role");
        startPt = toSvg(e.clientX, e.clientY); startBox = cur(sel);
        e.stopPropagation(); e.preventDefault(); return;
      }
      var g = e.target.closest && e.target.closest("g.node");
      if (g && g.getAttribute("data-id")) {
        var id = g.getAttribute("data-id");
        if (id !== sel) selectBox(id);
        mode = "move"; dragId = id; startPt = toSvg(e.clientX, e.clientY); startBox = cur(id);
        e.stopPropagation(); e.preventDefault(); return;
      }
      deselect();  // empty space → clear selection; let pan proceed (no stopPropagation)
    }, true);
    window.addEventListener("mousemove", function (e) {
      if (!mode) return;
      var p = toSvg(e.clientX, e.clientY), dx = p.x - startPt.x, dy = p.y - startPt.y;
      edits[dragId] = edits[dragId] || {};
      if (mode === "move") {
        edits[dragId].x = Math.round(startBox.x + dx); edits[dragId].y = Math.round(startBox.y + dy);
      } else {
        var x = startBox.x, y = startBox.y, w = startBox.w, h = startBox.h;
        if (role.indexOf("n") > -1) { y = startBox.y + dy; h = startBox.h - dy; }
        if (role.indexOf("s") > -1) { h = startBox.h + dy; }
        if (role.indexOf("w") > -1) { x = startBox.x + dx; w = startBox.w - dx; }
        if (role.indexOf("e") > -1) { w = startBox.w + dx; }
        if (w < 20) { w = 20; if (role.indexOf("w") > -1) x = startBox.x + startBox.w - 20; }
        if (h < 20) { h = 20; if (role.indexOf("n") > -1) y = startBox.y + startBox.h - 20; }
        edits[dragId].x = Math.round(x); edits[dragId].y = Math.round(y);
        edits[dragId].w = Math.round(w); edits[dragId].h = Math.round(h);
      }
      reflow(dragId);
    });
    window.addEventListener("mouseup", function () {
      if (mode && sel) {
        var c = cur(sel);
        document.getElementById("epW").value = Math.round(c.w);
        document.getElementById("epH").value = Math.round(c.h);
      }
      mode = null; dragId = null; role = null;
    });

    // while editing, suppress the normal node-click → detail-panel selection
    svg.addEventListener("click", function (e) { e.stopPropagation(); }, true);
  }

  setTab("deploy");
})();
