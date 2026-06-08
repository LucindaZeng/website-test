-- ============================================================
-- Seed real Blog articles into cms_news (type='blog').
-- Three content types: Materials Selection / Design Guide / Quality & Inspection.
-- Idempotent: deletes only these slugs, then re-inserts. Review before applying.
-- ============================================================
DELETE FROM cms_news WHERE type = 'blog' AND slug IN ('aluminum-6061-vs-7075', 'stainless-steel-303-304-316l', 'dfm-tips-reduce-cnc-cost', 'designing-for-5-axis', 'cmm-inspection-fai-reports', 'ppap-iatf16949-explained');

INSERT INTO cms_news (type, title, slug, category, excerpt, content, image_url, author, published_at, is_published, is_pinned) VALUES ('blog', 'Aluminum 6061 vs 7075 for CNC Machined Parts: How to Choose', 'aluminum-6061-vs-7075', 'Materials Knowledge Hub', 'A practical comparison of the two most common structural aluminum alloys — strength, machinability, corrosion resistance, weldability and cost — so you can pick the right one before you cut metal.', '6061 and 7075 are the two aluminum alloys we machine most often, and choosing between them early saves cost and avoids surprises at inspection. Both are heat-treatable, but they are built for different jobs.

6061-T6 is the general-purpose workhorse. It machines cleanly, welds and anodizes well, and resists corrosion. With a yield strength around 276 MPa it covers the large majority of brackets, housings, plates and fixtures. It is also less expensive and more widely stocked, which usually means shorter lead times.

7075-T6 is the high-strength choice, with a yield strength around 503 MPa — close to many steels at roughly a third of the weight. It is the standard for aerospace structure and highly loaded parts. The trade-offs are real: it is not readily weldable, its corrosion resistance is lower (so it is often anodized or used as Alclad), and the raw material costs noticeably more.

For machinability, both cut well, but 7075 chips break more cleanly at high speed while 6061 can be slightly gummier. Neither is difficult on modern CNC equipment, so this rarely drives the decision.

A simple rule of thumb: choose 6061 when corrosion resistance, weldability, anodizing cosmetics or cost matter most; choose 7075 when strength-to-weight is the priority and the part will not be welded. When you are unsure, send us the drawing and load case during DFM review and we will recommend the alloy — and the heat-treat temper — that meets the requirement at the lowest cost.', '/images/content/metals-alloys-card-800x600.webp', 'WFX Engineering Team', '2026-05-28', 1, 0);
INSERT INTO cms_news (type, title, slug, category, excerpt, content, image_url, author, published_at, is_published, is_pinned) VALUES ('blog', 'Stainless Steel for CNC Machining: 303 vs 304 vs 316L', 'stainless-steel-303-304-316l', 'Materials Knowledge Hub', 'When to choose free-machining 303, general-purpose 304, or corrosion-resistant 316L — and how the choice affects finish, weldability and cost.', 'The three austenitic stainless grades we see most are 303, 304 and 316L. They look similar but behave differently in the cut and in service.

303 is the free-machining grade. Added sulfur breaks chips and lets us run faster with better surface finish and longer tool life, which lowers cost on high-volume turned parts such as shafts, fittings and fasteners. The trade-off is reduced corrosion resistance and poor weldability, so 303 is best for non-welded parts in mild environments.

304 is the general-purpose stainless — good corrosion resistance, weldable, and widely available. It machines more slowly than 303 and work-hardens if feeds and speeds are wrong, so consistent tooling matters. It suits most enclosures, brackets and food-contact hardware.

316L adds molybdenum for superior resistance to chlorides and pitting, making it the choice for marine, medical and chemical applications. The low-carbon "L" reduces carbide precipitation during welding, protecting corrosion resistance at the weld. It is the most expensive of the three and the slowest to machine.

In short: 303 for cost-driven, non-welded parts; 304 for everyday corrosion resistance and weldability; 316L for harsh or biocompatible environments. Tell us the operating environment and any cleaning or sterilization requirements and we will confirm the grade and finish during DFM review.', '/images/content/metals-alloys-card-800x600.webp', 'WFX Engineering Team', '2026-05-20', 1, 0);
INSERT INTO cms_news (type, title, slug, category, excerpt, content, image_url, author, published_at, is_published, is_pinned) VALUES ('blog', '10 DFM Tips to Reduce CNC Machining Cost', 'dfm-tips-reduce-cnc-cost', 'Engineering Drawings & DFM', 'Ten design-for-manufacturability rules that cut tooling, setup and inspection cost without sacrificing function — apply them before you request a quote.', 'Most of a machined part''s cost is locked in by its design. These ten DFM rules consistently lower price and lead time.

1. Loosen tolerances you do not need. A blanket ±0.005 mm on every dimension forces slow cuts and 100% CMM checks. Call out tight tolerances only where they matter and leave the rest at standard.

2. Use generous internal radii. Sharp internal corners require small tools and slow passes. A larger corner radius lets us use a bigger, stiffer cutter and run faster.

3. Limit deep pockets. Pocket depth beyond about 4x the tool diameter needs long, fragile tools and light cuts. Keep depths shallow or break the feature into steps.

4. Avoid thin walls. Walls below ~0.8 mm in metal vibrate and deflect, hurting tolerance and finish. Thicken where you can.

5. Standardize hole sizes to drill diameters so we avoid custom tooling, and add chamfers to ease assembly.

6. Reduce the number of setups. Features on five faces cost more than features on one or two. Designing for fewer orientations cuts setup and fixturing time.

7. Specify surface finish only where required. A mirror finish everywhere adds polishing cost; a standard as-machined finish is usually fine for non-cosmetic surfaces.

8. Avoid engraved text and tiny features unless functional — they add separate operations.

9. Choose a machinable material. Free-machining grades and aluminum cut faster than tough alloys; if the application allows, the cheaper-to-cut material wins.

10. Send a 3D model (STEP) plus a 2D drawing with GD&T. Clear datums and critical dimensions prevent rework and speed quoting.

Upload your STEP file for a free 24-hour DFM review and we will flag any of these cost drivers before you commit to production.', '/images/content/CNC_Milling_800x600.webp', 'WFX Engineering Team', '2026-05-15', 1, 0);
INSERT INTO cms_news (type, title, slug, category, excerpt, content, image_url, author, published_at, is_published, is_pinned) VALUES ('blog', 'Designing Parts for 5-Axis CNC Machining', 'designing-for-5-axis', 'Engineering Drawings & DFM', 'How to design complex geometry that takes advantage of 5-axis machining — fewer setups, tighter true position, and better finishes on contoured surfaces.', '5-axis machining moves the tool or the part along two rotary axes in addition to the usual three linear axes. Designed for correctly, it cuts complex parts in a single setup, which improves accuracy and shortens lead time.

The biggest benefit is fewer setups. When a part has features on multiple faces, 5-axis lets us reach them in one fixturing, eliminating the stack-up error that comes from re-clamping. That is why 5-axis is preferred for aerospace structure, medical implants and impellers where true position across faces must be held tightly.

To design for it, think about tool access. Deep cavities with steep walls may still need long tools; tilting the tool with the rotary axes keeps it short and rigid, so design features that allow the cutter to approach at an angle. Avoid undercuts that no straight tool can reach unless you intend specialized tooling.

Continuous contoured surfaces — turbine blades, manifolds, organic housings — are where 5-axis shines, because the tool stays normal to the surface for a consistent finish. Provide a clean, watertight 3D model; complex surfaces defined only on a 2D drawing are hard to reproduce.

Finally, leave clamping features or sacrificial stock so the part can be held without colliding with the rotary motion. During DFM review we will confirm reachability, suggest where to consolidate setups, and identify any features that need a custom approach.', '/images/content/5-Axis_Machining_800x600.webp', 'WFX Engineering Team', '2026-05-08', 1, 0);
INSERT INTO cms_news (type, title, slug, category, excerpt, content, image_url, author, published_at, is_published, is_pinned) VALUES ('blog', 'Understanding CMM Inspection and First Article Inspection (FAI) Reports', 'cmm-inspection-fai-reports', 'Related Processes & Quality', 'What a coordinate measuring machine actually measures, how to read an FAI report, and why dimensional documentation protects your program.', 'A coordinate measuring machine (CMM) probes points on a part and compares the measured geometry against the CAD model and drawing. It reports actual dimensions, form (flatness, roundness) and true position with micron-level accuracy, far beyond what hand tools can verify repeatably.

A First Article Inspection (FAI) report documents that the first part off a process meets every drawing requirement before production runs. A typical report "balloons" the drawing — numbers each dimension — and lists, for each: the nominal value, the tolerance, the measured value, and a pass/fail result. It also records material certs, the equipment used and the inspector.

Reading one is straightforward: scan the result column for any out-of-tolerance items, then check that critical and key characteristics (often flagged on the drawing) are in the middle of their tolerance band, not riding the edge. A capable process keeps measured values centered.

FAI matters because it catches setup and interpretation errors early, creates a traceable record for audits, and gives both sides an objective reference if a dimension is later questioned. For regulated industries it is often mandatory.

We inspect on Zeiss and Hexagon CMMs and can supply a full dimensional report or an AS9102-style FAI with your order. Tell us which characteristics are critical and we will report them every time.', '/images/content/Precision_Inspection_800x600.webp', 'WFX Engineering Team', '2026-04-30', 1, 0);
INSERT INTO cms_news (type, title, slug, category, excerpt, content, image_url, author, published_at, is_published, is_pinned) VALUES ('blog', 'PPAP and IATF 16949: What They Mean for Your CNC Parts', 'ppap-iatf16949-explained', 'Related Processes & Quality', 'A plain-English guide to PPAP submission levels and the IATF 16949 quality system — what they cover and when your program needs them.', 'If you source parts for automotive or other regulated supply chains, two terms come up constantly: PPAP and IATF 16949.

IATF 16949 is the quality management standard for automotive production. Built on ISO 9001, it adds requirements for defect prevention, process control and continual improvement specific to the automotive supply chain. A supplier certified to it has audited systems for traceability, corrective action and risk management — assurance that quality is built into the process, not just inspected at the end.

PPAP (Production Part Approval Process) is the package of evidence that proves a part and its process are ready for production. Depending on the agreed submission level, it can include the design record, an FAI / dimensional results, material and performance test results, process flow diagrams, a PFMEA, a control plan, measurement system analysis (MSA), capability studies (Cpk) and a signed Part Submission Warrant (PSW).

The submission level scales with risk: Level 1 is just the warrant; Level 3 (the common default) includes full dimensional, material and capability data with samples; Level 5 keeps everything available for review at the supplier. Your customer specifies the level.

In practice, IATF 16949 describes how the factory runs; PPAP is how a specific part is approved to run there. We are ISO 9001 and IATF 16949 certified and can prepare PPAP documentation to the level your program requires — tell us the level and required elements when you request a quote.', '/images/content/Quality_Assurance_800x600.webp', 'WFX Engineering Team', '2026-04-22', 1, 0);
