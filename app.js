/* Databricks on GCP — interactive setup walkthrough.
   One trust-zone canvas (from diagram-1). Tab 1 builds it up step-by-step;
   tabs 2 & 3 animate the cluster-launch (diagram-3) and steady-state runtime
   (diagram-4) flows over the completed topology. Pure client-side, no deps. */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  var ORDER = ["0", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8"];
  var oi = function (s) { return ORDER.indexOf(String(s)); };

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
    { id: "host",      step: "0", x: 330, y: 190, w: 850, h: 445, label: "HOST PROJECT — SHARED VPC (NETWORK, CENTRALLY OWNED)", cls: "frame" },
    { id: "service",   step: "2.1", x: 330, y: 665, w: 410, h: 335, label: "SERVICE PROJECT — DATABRICKS COMPUTE + STORAGE", cls: "frame" },
    { id: "maildata",  step: "0", x: 770, y: 665, w: 410, h: 335, label: "YAHOO MAIL DATA PROJECTS (EXISTING)", cls: "frame" },
    { id: "dbx",       step: "0", x: 1240, y: 140, w: 400, h: 700, label: "DATABRICKS-OWNED GCP PROJECTS — OUTSIDE THE PERIMETER", cls: "frame" },
    { id: "internet",  step: "0", x: 1240, y: 870, w: 400, h: 120, label: "PUBLIC INTERNET", cls: "frame" },
    { id: "pscsubnet", step: "2.2", x: 890, y: 225, w: 270, h: 265, label: "PSC SUBNET 10.10.1.0/28", cls: "subframe" },
    { id: "nodesubnet",step: "2.2", x: 350, y: 420, w: 510, h: 185, label: "NODE SUBNET 10.10.0.0/24 · NPIP · PGA ON", cls: "subframe" }
  ];

  /* ---------------- resource nodes ----------------
     step: when it appears in the deployment (ORDER) or "run" (only in tabs 2/3). */
  var nodes = [
    { id: "admin", step: "0", x: 40, y: 150, w: 230, h: 110, title: "Admin / Analyst",
      lines: ["Browser · REST / CLI", "reaches the VPC via corp VPN /", "private route — no public front door"] },

    // Databricks-owned side
    { id: "wssa", step: "2.4", x: 1265, y: 180, w: 350, h: 95, title: "Workspace service account", accent: true,
      lines: ["db-<id>@prod-gcp-<region> · control-plane-owned", "the launcher — creates VMs across the boundary"],
      identity: "IDENTITY · the launcher — never the VMs' runtime identity" },
    { id: "plproxy", step: "0", x: 1265, y: 290, w: 350, h: 85, title: "PSC service attachment — plproxy",
      lines: ["frontend: workspace UI / REST (users + clusters)", "…/plproxy-psc-endpoint-all-ports"] },
    { id: "ngrok", step: "0", x: 1265, y: 390, w: 350, h: 85, title: "PSC service attachment — ngrok",
      lines: ["backend: secure cluster connectivity relay", "…/ngrok-psc-endpoint"] },
    { id: "controlplane", step: "0", x: 1265, y: 490, w: 350, h: 175, title: "Regional control plane",
      lines: ["workspace app · cluster manager (acts as the", "Workspace SA) · job scheduler · UC metastore —", "metadata only; issues down-scoped tokens;", "data never transits here", "notebook state / query text: CMEK (MANAGED)"],
      identity: "IDENTITY · Databricks-managed; reached only via PSC" },
    { id: "accountapi", step: "0", x: 1265, y: 680, w: 350, h: 140, title: "Account API",
      lines: ["accounts.gcp.databricks.com · provisioning ·", "registers CMEK · PSC endpoints · PAS", "SCIM / IdP sync (Okta → Account API)"],
      identity: "IDENTITY · account admin (Google OIDC tokens)" },

    // Host project — network (2.2)
    { id: "dnszone", step: "2.2", x: 350, y: 235, w: 250, h: 155, title: "Private DNS zone",
      lines: ["gcp.databricks.com", "resolves workspace hostnames to", "the private PSC endpoint IPs"], pill: "dns" },
    { id: "routernat", step: "2.2", x: 620, y: 235, w: 230, h: 110, title: "Cloud Router + NAT",
      optional: true, lines: ["outbound only · for public package", "installs · removable with mirrors"] },

    // creator-role grants (read-only) — shown as badges on the project frames
    { id: "crSvc", step: "2.1", x: 620, y: 655, w: 120, h: 17, badge: true, title: "creator role (RO)" },
    { id: "crHost", step: "2.2", x: 995, y: 182, w: 185, h: 18, badge: true, title: "creator role (RO) → creator SA" },
    { id: "frontendpsc", step: "2.2", x: 905, y: 258, w: 240, h: 95, title: "Frontend PSC endpoint",
      lines: ["fwd-rule + internal IP", "workspace UI / REST · TLS 443"], pill: "psc" },
    { id: "backendpsc", step: "2.2", x: 905, y: 365, w: 240, h: 80, title: "Backend PSC endpoint",
      lines: ["fwd-rule + internal IP", "SCC relay · TCP 6666"], pill: "psc" },
    { id: "firewall", step: "2.2", x: 350, y: 610, w: 0, h: 0, textOnly: true,
      lines: ["Firewall: node → PSC 443 · 6666 · 8443–8451 · intra-subnet only · no inbound from internet"] },

    // Node subnet — runtime VMs (tabs 2/3)
    { id: "drivervm", step: "run", x: 370, y: 452, w: 220, h: 112, title: "Driver VM",
      lines: ["Databricks Runtime", "Photon — C++ vectorized engine"],
      identity: "IDENTITY · runs as Compute SA / Cluster SA" },
    { id: "execvm", step: "run", x: 610, y: 452, w: 220, h: 112, title: "Executor VMs × N",
      lines: ["Spark executors (autoscaling)", "Photon — C++ vectorized engine"],
      identity: "IDENTITY · runs as Compute SA / Cluster SA" },

    // Service project
    { id: "computesa", step: "2.8", x: 350, y: 705, w: 370, h: 110, title: "Compute SA (+ optional Cluster SA)",
      lines: ["databricks-compute@<service-project> — GCE default", "identity the driver / executor VMs run as", "minimal perms (logging / metrics)"],
      identity: "IDENTITY · the VMs' runtime identity — not the launcher" },
    { id: "kms", step: "2.3", x: 350, y: 825, w: 370, h: 85, title: "Cloud KMS — CMEK key",
      lines: ["customer keyring + key · STORAGE + MANAGED_SERVICES", "Google compute & storage agents: encrypt / decrypt"],
      identity: "IDENTITY · Google agents + Workspace SA (MANAGED, 2.7)" },
    { id: "wsbuckets", step: "2.8", x: 350, y: 920, w: 370, h: 70, title: "Workspace GCS buckets + GCE disks",
      lines: ["workspace system data + DBFS root · CMEK-encrypted"] },

    // Mail data projects (existing context)
    { id: "datalake", step: "0", x: 790, y: 705, w: 370, h: 82, title: "GCS — data-lake bucket(s) · read-only",
      lines: ["Yahoo Mail data · objectViewer + legacyBucketReader"],
      identity: "IDENTITY · vended UC storage-credential SA (RO)" },
    { id: "analytics", step: "0", x: 790, y: 797, w: 370, h: 82, title: "GCS — analytics bucket (PoC) · read-write",
      lines: ["benchmark outputs · managed tables"],
      identity: "IDENTITY · vended UC storage-credential SA (RW)" },
    { id: "bigquery", step: "0", x: 790, y: 889, w: 370, h: 60, title: "BigQuery",
      lines: ["Yahoo Mail datasets · billing export + authorized view"] },

    // Public internet
    { id: "pkgrepos", step: "0", x: 1265, y: 905, w: 350, h: 70, title: "Package repos — PyPI · Maven · npm",
      lines: ["reachable only via Cloud NAT (outbound) · no inbound"] }
  ];

  /* ---------------- persistent deployment "grant" edges ---------------- */
  // grant edges from the Workspace SA into the perimeter. Routed via the right gap +
  // bottom corridor so they never cross the Yahoo Mail data projects frame.
  var edges = [
    { id: "e25", step: "2.5", d: "M1265,270 H1226 V1050 H430 V1000", label: "2.5 · project + resource roles → WS SA", lx: 690, ly: 1046 },
    { id: "e26", step: "2.6", d: "M1265,250 H1192 V600 H862", label: "2.6 · network role → WS SA", lx: 1015, ly: 592 },
    { id: "e27", step: "2.7", d: "M1265,262 H1232 V1070 H344 V867 H350", label: "2.7 · CMEK MANAGED_SERVICES → WS SA", lx: 640, ly: 1066 }
  ];

  // PSC "wires": consumer endpoint → producer service attachment. Dashed/pending when
  // the endpoints are first created (2.2); solid once registered → ACCEPTED (2.4).
  var pscWires = [
    { id: "wf", d: "M1145,305 H1205 V332 H1263" },
    { id: "wb", d: "M1145,405 H1205 V432 H1263" }
  ];

  /* ---------------- deployment steps ---------------- */
  var steps = [
    { id: "0", label: "Starting point", short: "Before we begin", team: null,
      narrative: "What already exists before the build. Yahoo's VPC-SC perimeter and Shared-VPC host project are long-standing. On the Databricks side (outside the perimeter) the region's PSC service attachments (plproxy, ngrok), the regional control plane, and the Account API already run. The Mail data lake and BigQuery exist and are governed later.",
      privileges: [], creates: [],
      note: "Four service accounts to keep straight: Workspace SA (launcher, control-plane-owned), Compute SA (what the VMs run as), optional Cluster SA (custom per-cluster), and the vended UC storage-credential SA (governed reads)." },

    { id: "2.1", label: "Create service project", short: "Service project", team: "foundation", repo: "service-project/",
      narrative: "Cloud Foundation creates the service project (the tenant for this one workspace), enables its APIs, attaches it to the existing Shared VPC host, and provisions the GCS/compute service agents. It also defines the read-only workspace-creator role and grants it to the creator SA on the service project.",
      privileges: ["resourcemanager.projectCreator", "billing.user", "compute.xpnAdmin", "resourcemanager.projectIamAdmin", "serviceusage.serviceUsageAdmin", "iam.roleAdmin"],
      creates: ["service", "crSvc"], creatLabel: ["Service project (empty)", "Creator role — service (read-only) → creator SA"] },

    { id: "2.2", label: "Create network", short: "Network", team: "network", repo: "network/",
      narrative: "Network Engineering builds the private landing zone inside the host project: VPC + node subnet (NPIP, PGA on) + PSC subnet, firewall, Cloud Router/NAT, the private DNS zone (zone only — records come in 2.6), and the two PSC endpoints, which come up PENDING. It also grants the read-only creator role on the host project.",
      privileges: ["compute.networkAdmin", "compute.securityAdmin", "dns.admin", "iam.roleAdmin"],
      creates: ["dnszone", "routernat", "pscsubnet", "frontendpsc", "backendpsc", "nodesubnet", "firewall", "crHost"],
      creatLabel: ["VPC + node/PSC subnets", "Cloud Router + NAT (optional)", "Private DNS zone (no records yet)", "Frontend + Backend PSC endpoints (PENDING)", "Creator role — host (read-only) → creator SA"] },

    { id: "2.3", label: "CMEK key", short: "CMEK", team: "security", repo: "cmek/",
      narrative: "Cloud Security creates the CMEK keyring + key in the service project and grants encrypt/decrypt to the service project's Google-managed compute-system and gs-project-accounts agents — the STORAGE use case only. The MANAGED_SERVICES grant to the Workspace SA waits for 2.7.",
      privileges: ["cloudkms.admin  (service project)"],
      creates: ["kms"], creatLabel: ["CMEK key (STORAGE agent grants)"] },

    { id: "2.4", label: "Create workspace — PHASE 1", short: "Workspace (PROVISIONING)", team: "data", repo: "workspace/ (finalize=false)",
      narrative: "Data Platform, as the account admin, registers the CMEK key, the two PSC endpoints (which flips them PENDING → ACCEPTED), the private access settings, and the network config — then creates the workspace paused in PROVISIONING. Databricks mints and returns the Workspace SA without building any GCS/GCE yet.",
      privileges: ["Databricks account admin", "read-only creator roles (2.1 + 2.2)"],
      creates: ["wssa"], creatLabel: ["Workspace SA (minted, returned)", "PSC endpoints → ACCEPTED", "Private access settings · network config"],
      states: { frontendpsc: "ACCEPTED", backendpsc: "ACCEPTED", wssa: "workspace: PROVISIONING" },
      flows: ["v_net", "v_svc", "v_cmek"], pulse: ["service", "frontendpsc", "backendpsc", "kms"],
      substep: "Sub-step: using the read-only creator roles from 2.1/2.2, the Account API first reaches into the service project, the host network/PSC, and the CMEK key to validate settings — read-only — before it creates anything." },

    { id: "2.5", label: "Workspace-SA operator roles", short: "Operator roles", team: "iam", repo: "workspace-sa-roles/",
      narrative: "Cloud IAM defines and grants the Project role and the workspace-scoped Resource role to the Workspace SA on the service project. The Resource role carries storage.buckets.create / compute.instances.create — the permissions that let the SA build the workspace's storage and VMs — scoped by an IAM condition to this workspace's resources.",
      privileges: ["iam.roleAdmin  (service project)", "resourcemanager.projectIamAdmin  (service project)"],
      creates: [], edges: ["e25"], creatLabel: ["Project role + Resource role → Workspace SA"] },

    { id: "2.6", label: "Post-workspace config", short: "Network role + DNS", team: "network", repo: "post-workspace/",
      narrative: "Network Engineering grants the Workspace SA the custom network role (subnetworks.get/use) on the node subnet so it can place VMs across the Shared-VPC boundary, and writes the four DNS A-records into the zone so workspace hostnames resolve to the private PSC IPs.",
      privileges: ["compute.networkAdmin", "dns.admin", "iam.roleAdmin"],
      creates: [], edges: ["e26"], creatLabel: ["Network role → Workspace SA (node subnet)", "4 DNS A-records"],
      states: { dnszone: "records" } },

    { id: "2.7", label: "MANAGED_SERVICES CMEK grant", short: "CMEK grant", team: "security", repo: "cmek-workspace-grant/",
      narrative: "Cloud Security grants the Workspace SA cryptoKeyEncrypterDecrypter on the CMEK key — the MANAGED_SERVICES half — so control-plane data (notebook source, results, secrets, SQL history) is encrypted with the customer key.",
      privileges: ["cloudkms.admin  (service project)"],
      creates: [], edges: ["e27"], creatLabel: ["CMEK encrypt/decrypt → Workspace SA"] },

    { id: "2.8", label: "Finalize — PHASE 2", short: "Workspace RUNNING", team: "data", repo: "workspace/ (finalize=true)",
      narrative: "Data Platform re-applies with finalize=true. expected_workspace_status flips to RUNNING; the now-authorized Workspace SA provisions the workspace GCS buckets + GCE disks (CMEK-encrypted) and creates the Compute SA. The workspace is assigned to the metastore and reaches RUNNING.",
      privileges: ["Databricks account admin"],
      creates: ["computesa", "wsbuckets"], creatLabel: ["Compute SA", "Workspace GCS buckets + GCE disks", "Workspace → RUNNING"],
      states: { wssa: "workspace: RUNNING" } }
  ];

  /* ---------------- flows (tabs 2 & 3) ---------------- */
  var flows = {
    // cluster launch
    l1a:   { c: "#2a78d6", d: "M270,205 H872 V305 H901", m: "b", label: "L1 · clusters/create · TLS 443", lx: 780, ly: 190, cross: [[300, 205, "B1"]] },
    l1b:   { c: "#2a78d6", d: "M1145,305 H1205 V332 H1263", m: "b", label: "B2", lx: 1180, ly: 300, cross: [[1205, 332, "B2"]] },
    l2:    { c: "#eb6834", d: "M1263,600 H1225 V1058 H755 V760 H722", m: "o", label: "L2 · GCE: launch VMs — as the Workspace SA", lx: 985, ly: 1052, cross: [[1210, 1058, "B6"]] },
    boot:  { c: "#eb6834", dash: "6 4", d: "M535,703 V607", m: "o", label: "VMs boot Runtime + Photon — as Compute SA", lx: 545, ly: 650 },
    tunnel:{ c: "#c3c2b7", dash: "4 3", d: "M450,420 V393", m: "g", label: "resolve tunnel.<region>", lx: 462, ly: 410 },
    l3:    { c: "#eb6834", d: "M860,505 H882 V405 H901", m: "o", label: "L3 · 6666", lx: 874, ly: 470 },
    b3:    { c: "#eb6834", d: "M1145,405 H1205 V432 H1263", m: "o", label: "B3", lx: 1180, ly: 400, cross: [[1205, 405, "B3"]] },
    // notebook runtime
    n1:    { c: "#2a78d6", d: "M270,205 H872 V305 H901", m: "b", label: "F1 · notebook command · TLS 443", lx: 790, ly: 190, cross: [[300, 205, "B1"]] },
    n1b:   { c: "#2a78d6", d: "M1145,305 H1205 V332 H1263", m: "b", label: "B2", lx: 1180, ly: 300, cross: [[1205, 332, "B2"]] },
    n2:    { c: "#eb6834", d: "M860,470 H884 V300 H901", m: "o", label: "F4 · UC metadata + token · 443", lx: 690, ly: 444 },
    f5:    { c: "#eb6834", dash: "6 4", d: "M860,525 H872 V405 H901", m: "o", label: "F5 · SCC relay · 6666", lx: 690, ly: 592 },
    f7:    { c: "#1baf7a", d: "M700,565 V700 H784", m: "a", label: "F7 · read (UC RO SA)", lx: 515, ly: 648, cross: [[786, 700, "ingress"]] },
    f8:    { c: "#1baf7a", d: "M745,565 V806 H784", m: "a", label: "F8 · write (UC RW SA)", lx: 515, ly: 670, cross: [[786, 806, "ingress"]] },
    ret:   { c: "#2a78d6", dash: "5 4", d: "M901,320 H860 V472 H832", m: "b", label: "results → analyst (nothing data-bearing via control plane)", lx: 690, ly: 700 },
    // 2.4 read-only "verify settings" sub-animation (Account API, via the creator role)
    v_net:  { c: "#8a8880", dash: "5 4", d: "M1265,700 H1216 V332 H1149", m: "g", label: "verify · network / PSC (read-only)", lx: 1120, ly: 700 },
    v_svc:  { c: "#8a8880", dash: "5 4", d: "M1265,758 H1210 V1044 H520 V1000", m: "g", label: "verify · service project (read-only)", lx: 800, ly: 1040 },
    v_cmek: { c: "#8a8880", dash: "5 4", d: "M1265,772 H1200 V1066 H346 V905 H350", m: "g", label: "verify · CMEK (read-only)", lx: 470, ly: 1062 }
  };

  var launchStages = [
    { id: "L1", title: "L1 · Analyst starts a cluster", team: "data",
      desc: "POST /api/2.x/clusters/create over TLS 443 crosses the perimeter (B1) and the frontend PSC wire (B2) to the control-plane cluster manager. Auth = Okta session / PAT.",
      flows: ["l1a", "l1b"], focus: ["admin", "frontendpsc", "plproxy", "controlplane"] },
    { id: "L2", title: "L2 · Cluster manager launches VMs", team: "data",
      desc: "Acting AS the Workspace SA (control-plane-owned launcher), the cluster manager calls the GCE API to create driver + executor VMs in the service project with CMEK-encrypted disks (crosses B6). The VMs boot as the Compute SA — never the Workspace SA.",
      flows: ["l2", "boot"], reveal: ["drivervm", "execvm"], focus: ["controlplane", "computesa", "drivervm", "execvm", "kms"] },
    { id: "L3", title: "L3 · Cluster dials home (SCC relay)", team: "data",
      desc: "The VMs resolve tunnel.<region> in the private DNS zone, open TCP 6666 outbound to the backend endpoint → ngrok attachment (B3). The cluster registers and reaches RUNNING. No inbound path to the cluster exists.",
      flows: ["tunnel", "l3", "b3"], focus: ["drivervm", "backendpsc", "ngrok"], run: "RUNNING" }
  ];

  var notebookStages = [
    { id: "N1", title: "N1 · Analyst submits a command", team: "data",
      desc: "A notebook cell / SQL query goes from the analyst's browser over the frontend PSC wire (F1, B1→B2) to the workspace — the cluster is already RUNNING. Okta/OIDC auth happens on a back-channel, not on this wire.",
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
  var elByNode = {}, elByContainer = {}, elByEdge = {}, elByFlow = {}, elByWire = {};

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
    var g = E("g", { class: "node container", "data-step": c.step }, layC);
    var isPeri = c.cls === "perimeter", isSub = c.cls === "subframe";
    E("rect", {
      class: "box", x: c.x, y: c.y, width: c.w, height: c.h, rx: 12,
      fill: isSub ? "none" : "#f9f9f7",
      stroke: isPeri ? "#d03b3b" : "#c9c8c0",
      "stroke-width": isPeri ? 2 : 1,
      "stroke-dasharray": isPeri ? "8 5" : (isSub ? "4 3" : "0")
    }, g);
    txt(g, c.x + 16, c.y + 20, c.label, { "font-size": 10.5, "font-weight": 700, "letter-spacing": "0.4", fill: isPeri ? "#d03b3b" : "#898781" });
    elByContainer[c.id] = g;
  }

  function drawNode(n) {
    var g = E("g", { class: "node", "data-step": n.step, "data-id": n.id }, layN);
    if (n.textOnly) {
      txt(g, n.x, n.y, n.lines[0], { "font-size": 10.5, fill: "#52514e" });
      elByNode[n.id] = g; return;
    }
    if (n.badge) {
      E("rect", { class: "box", x: n.x, y: n.y, width: n.w, height: n.h, rx: n.h / 2, fill: "#fff4ef", stroke: "#eb6834", "stroke-width": 1.2 }, g);
      txt(g, n.x + n.w / 2, n.y + 13, n.title, { "font-size": 9.5, "font-weight": 700, "text-anchor": "middle", fill: "#b3421f" });
      elByNode[n.id] = g; return;
    }
    E("rect", { class: "box", x: n.x, y: n.y, width: n.w, height: n.h, rx: 8,
      fill: "#ffffff", stroke: n.optional ? "#b98b00" : (n.accent ? "#eb6834" : "#e1e0d9"),
      "stroke-width": (n.optional || n.accent) ? 1.5 : 1,
      "stroke-dasharray": n.optional ? "6 4" : "0" }, g);
    if (n.optional) {
      var ow = 66;
      E("rect", { x: n.x + n.w - ow - 8, y: n.y + 7, width: ow, height: 16, rx: 8, fill: "#fff7e6", stroke: "#e0b25a" }, g);
      txt(g, n.x + n.w - ow / 2 - 8, n.y + 19, "OPTIONAL", { "font-size": 9, "font-weight": 700, "text-anchor": "middle", fill: "#a86300" });
    }
    txt(g, n.x + 12, n.y + 22, n.title, { "font-size": 12.5, "font-weight": 600, fill: "#0b0b0b" });
    (n.lines || []).forEach(function (ln, i) {
      txt(g, n.x + 12, n.y + 40 + i * 14.5, ln, { "font-size": 10.3, fill: "#52514e" });
    });
    if (n.identity) txt(g, n.x + 12, n.y + n.h - 9, n.identity, { "font-size": 9.3, "font-weight": 600, fill: "#eb6834" });
    if (n.pill) {
      var pg = E("g", { class: "statepill" }, g);
      var pr = E("rect", { x: n.x + n.w - 96, y: n.y + n.h - 25, width: 88, height: 17, rx: 8.5, fill: "#fff", stroke: "#c3c2b7" }, pg);
      var pt = txt(pg, n.x + n.w - 52, n.y + n.h - 13, "", { "font-size": 9.5, "font-weight": 700, "text-anchor": "middle", fill: "#898781" });
      g._pill = { rect: pr, text: pt, node: n };
    }
    g.classList.add("clickable");
    g.addEventListener("click", function () { selectNode(n.id); });
    elByNode[n.id] = g;
  }

  function drawEdge(e) {
    var g = E("g", { class: "flowg", "data-step": e.step }, layE);
    E("path", { class: "flow", d: e.d, stroke: "#eb6834", "stroke-width": 1.6, "stroke-dasharray": "5 4",
      fill: "none", "marker-end": "url(#arr-o)", opacity: 0.75 }, g);
    var lw = e.label.length * 6 + 16;
    E("rect", { x: e.lx - lw / 2, y: e.ly - 13, width: lw, height: 17, rx: 8.5, fill: "#fff4ef", stroke: "#f4c7b3" }, g);
    txt(g, e.lx, e.ly, e.label, { "font-size": 9.5, "font-weight": 600, "text-anchor": "middle", fill: "#b3421f" });
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
      var lw = f.label.length * 5.6 + 16;
      E("rect", { x: f.lx - lw / 2, y: f.ly - 13, width: lw, height: 17, rx: 8.5, fill: "#fff", stroke: f.c }, g);
      txt(g, f.lx, f.ly, f.label, { "font-size": 10, "font-weight": 600, "text-anchor": "middle", fill: f.c });
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
  var layC, layE, layW, layN, layF;
  function renderAll() {
    buildDefs();
    E("rect", { x: 0, y: 0, width: 1680, height: 1160, fill: "#fcfcfb" }, svg);
    layC = E("g", { id: "layC" }, svg);
    layE = E("g", { id: "layE" }, svg);
    layW = E("g", { id: "layW" }, svg);
    layN = E("g", { id: "layN" }, svg);
    layF = E("g", { id: "layF" }, svg);
    containers.forEach(drawContainer);
    pscWires.forEach(drawWire);
    nodes.forEach(drawNode);
    edges.forEach(drawEdge);
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
      var wr = E("rect", { x: 1265 + 350 - 150, y: 180 + 6, width: 142, height: 17, rx: 8.5, fill: "#fff", stroke: "#c3c2b7" }, g);
      var wt = txt(g, 1265 + 350 - 79, 180 + 18, "", { "font-size": 9.5, "font-weight": 700, "text-anchor": "middle", fill: "#898781" });
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
    else if (maxIdx >= oi("2.4")) setWsStatus("PROVISIONING", false);
    else setWsStatus("", false);
  }

  function showDeployNodes(maxIdx) {
    containers.forEach(function (c) { toggle(elByContainer[c.id], oi(c.step) <= maxIdx && oi(c.step) >= 0); });
    nodes.forEach(function (n) {
      var vis = n.step !== "run" && oi(n.step) <= maxIdx && oi(n.step) >= 0;
      toggle(elByNode[n.id], vis);
    });
    edges.forEach(function (e) { toggle(elByEdge[e.id], oi(e.step) <= maxIdx); });
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
    nodes.forEach(function (n) { if (elByNode[n.id]) elByNode[n.id].classList.remove("dim", "selected", "pulsing"); });
    containers.forEach(function (c) { if (elByContainer[c.id]) elByContainer[c.id].classList.remove("dim", "selected"); });
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
    // setup-time grant edges are deployment-only; hide them under the runtime flows
    edges.forEach(function (e) { toggle(elByEdge[e.id], false); });
  }

  /* ================= tab drivers ================= */
  function renderRail(list, activeIdx, kind) {
    var ol = document.getElementById("stepList"); ol.innerHTML = "";
    list.forEach(function (s, i) {
      var li = document.createElement("li");
      li.className = "step-item" + (i === activeIdx ? " active" : "") + (i < activeIdx ? " done" : "");
      var badge = kind === "deploy" ? (s.id === "0" ? "•" : s.id) : s.id;
      var team = s.team ? TEAM[s.team].name : (kind === "deploy" ? "context" : "");
      li.innerHTML = '<span class="step-badge">' + badge + '</span><span class="step-meta"><span class="step-name">' +
        (s.short || s.title) + '</span><span class="step-team">' + team + '</span></span>';
      li.addEventListener("click", function () { goto(i); });
      ol.appendChild(li);
    });
  }

  function panelDeploy(s) {
    var p = document.getElementById("panelBody");
    var team = s.team ? TEAM[s.team] : null;
    var h = '<div class="step-id">' + (s.id === "0" ? "Starting point" : "Step " + s.id) + '</div>';
    h += '<h2>' + s.label + '</h2>';
    if (team) h += '<span class="chip" style="background:' + team.color + '">' + team.name + '</span>';
    h += '<p>' + s.narrative + '</p>';
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
    // appear-animate nodes/edges introduced at this step
    var s = steps[idx];
    (s.creates || []).forEach(function (id) { toggle(elByNode[id] || elByContainer[id], true, true); });
    (s.edges || []).forEach(function (id) { toggle(elByEdge[id], true, true); });
    // pulse the components this step touches / validates
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
      deploy: [["line", "#d03b3b", "VPC-SC boundary", "8 5"], ["line", "#eb6834", "identity / grant edge", "5 4"], ["dot", "#1baf7a", "created this step"], ["dot", "#e0b25a", "pending"]],
      launch: [["line", "#2a78d6", "user access"], ["line", "#eb6834", "control plane / launch"], ["line", "#c3c2b7", "DNS / boot", "4 3"], ["dot", "#d03b3b", "boundary crossing"]],
      notebook: [["line", "#2a78d6", "user access"], ["line", "#eb6834", "control plane"], ["line", "#1baf7a", "data plane (governed read)"], ["dot", "#d03b3b", "VPC-SC crossing"]]
    };
    L.innerHTML = "";
    sets[tab].forEach(function (it) {
      var s = document.createElement("span"); s.className = "lg";
      if (it[0] === "line") {
        var sw = document.createElement("span"); sw.className = "sw";
        sw.style.borderTopColor = it[1]; if (it[3]) sw.style.borderTopStyle = "dashed";
        s.appendChild(sw);
      } else {
        var d = document.createElement("span"); d.className = "dot"; d.style.background = it[1]; s.appendChild(d);
      }
      var t = document.createElement("span"); t.textContent = it[2]; s.appendChild(t);
      L.appendChild(s);
    });
  }

  function selectNode(id) {
    nodes.forEach(function (n) { if (elByNode[n.id]) elByNode[n.id].classList.remove("selected"); });
    var g = elByNode[id]; if (g) g.classList.add("selected");
    var n = nodes.find(function (x) { return x.id === id; }); if (!n) return;
    var p = document.getElementById("panelBody");
    var h = '<div class="step-id">Resource</div><h2>' + n.title + '</h2>';
    h += '<p>' + (n.lines || []).join("<br>") + '</p>';
    if (n.identity) h += '<p class="note" style="border-color:#f4c7b3;color:#b3421f">' + n.identity + '</p>';
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

  setTab("deploy");
})();
