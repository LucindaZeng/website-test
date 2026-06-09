/**
 * WFX Page Schemas
 * ─────────────────────────────────────────────────────────────────────────
 * The single source of truth for which pages have editable collections and
 * what fields each item has. The admin Collection Editor reads this to build
 * its forms automatically — so ADDING A NEW EDITABLE PAGE = ADDING ONE ENTRY
 * HERE. No new admin code, no new endpoint.
 *
 * Each collection's `page:collection` key must match:
 *   • the data-cms-collection="page:collection" attribute on the public page
 *   • the page/collection stored in the cms_collections table
 *
 * Field types: "text" (single line), "textarea" (multi-line), "image" (URL +
 * upload), "url" (link). The `key` of each field is what gets stored in the
 * item JSON and read by content-loader via data-field / data-field-src /
 * data-field-href on the public page's <template data-cms-item>.
 */
window.WFX_PAGE_SCHEMAS = {
    "cnc-milling": {
        label: "CNC Milling",
        collections: {
            equipment: {
                label: "设备 / Equipment",
                itemLabel: "Machine",
                fields: [
                    { key: "name",        label: "Name",        type: "text",     required: true },
                    { key: "description", label: "Description",  type: "textarea", required: true }
                ]
            }
        }
    },

    // Ready for the materials-page conversion (phase: material pages). Once
    // metals.html wraps its materials in data-cms-collection="metals-alloys:materials",
    // this entry makes them editable with zero further admin work.
    "metals-alloys": {
        label: "Metals & Alloys",
        collections: {
            materials: {
                label: "材料 / Materials",
                itemLabel: "Material",
                fields: [
                    { key: "name",         label: "Material (Grade)",  type: "text",     required: true },
                    { key: "category",     label: "Category / Series", type: "text" },
                    { key: "density",      label: "Density (g/cm³)",   type: "text" },
                    { key: "machinability",label: "Machinability",     type: "text", hint: "Excellent / Good / Fair / Poor" },
                    { key: "strength",     label: "Strength",          type: "text", hint: "Very High / High / Medium / Low" },
                    { key: "corrosion",    label: "Corrosion Res.",    type: "text", hint: "Excellent / Good / Fair / Poor" },
                    { key: "applications", label: "Best Applications", type: "textarea" },
                    { key: "family",       label: "Filter family",     type: "text", required: true,
                      hint: "aluminum / stainless / steel / copper / magnesium / titanium" }
                ]
            }
        }
    },

    // Add more pages below as they are converted, e.g.:
    // "cnc-turning":  { label: "CNC Turning",  collections: { equipment: {...} } },
    // "finishing":    { label: "Surface Finishing", collections: { processes: {...} } },

    "services": {
        label: "Services (overview)",
        collections: {
            cards: {
                label: "服务卡片 / Service cards",
                itemLabel: "Service",
                fields: [
                    { key: "title",       label: "Title",       type: "text", required: true },
                    { key: "description", label: "Description", type: "textarea" },
                    { key: "link",        label: "Link (href)", type: "url" },
                    { key: "icon",        label: "Icon class",  type: "text", hint: "e.g. fas fa-cog" }
                ]
            }
        }
    },

    "industries": {
        label: "Industries (overview)",
        collections: {
            cards: {
                label: "行业卡片 / Industry cards",
                itemLabel: "Industry",
                fields: [
                    { key: "title",       label: "Title",       type: "text", required: true },
                    { key: "description", label: "Description", type: "textarea" },
                    { key: "image",       label: "Image",       type: "image" },
                    { key: "icon",        label: "Icon class",  type: "text", hint: "e.g. fas fa-plane" },
                    { key: "link",        label: "Link (href)", type: "url" }
                ]
            }
        }
    },

    "faq": {
        label: "FAQ",
        collections: {
            general:   { label: "General Questions",   itemLabel: "Q&A", fields: [
                { key: "question", label: "Question", type: "text", required: true },
                { key: "answer",   label: "Answer",   type: "textarea", required: true } ] },
            technical: { label: "Technical Questions", itemLabel: "Q&A", fields: [
                { key: "question", label: "Question", type: "text", required: true },
                { key: "answer",   label: "Answer",   type: "textarea", required: true } ] },
            ordering:  { label: "Ordering & Shipping", itemLabel: "Q&A", fields: [
                { key: "question", label: "Question", type: "text", required: true },
                { key: "answer",   label: "Answer",   type: "textarea", required: true } ] }
        }
    },

    "case-studies": {
        label: "Case Studies",
        collections: {
            cases: {
                label: "Case Studies",
                itemLabel: "Case Study",
                fields: [
                    { key: "industry", label: "Industry", type: "text", required: true },
                    { key: "title", label: "Title", type: "text", required: true },
                    { key: "image", label: "Image", type: "image" },
                    { key: "icon", label: "Fallback icon class", type: "text" },
                    { key: "description", label: "Description", type: "textarea", required: true },
                    { key: "challenge", label: "Challenge", type: "textarea" },
                    { key: "solution", label: "Solution", type: "textarea" },
                    { key: "stat1_value", label: "Statistic 1 value", type: "text" },
                    { key: "stat1_label", label: "Statistic 1 label", type: "text" },
                    { key: "stat2_value", label: "Statistic 2 value", type: "text" },
                    { key: "stat2_label", label: "Statistic 2 label", type: "text" },
                    { key: "stat3_value", label: "Statistic 3 value", type: "text" },
                    { key: "stat3_label", label: "Statistic 3 label", type: "text" }
                ]
            }
        }
    },

    "tolerances": {
        label: "Tolerances",
        collections: {
            standards: {
                label: "Tolerance Standards",
                itemLabel: "Process",
                fields: [
                    { key: "process",    label: "Process",         type: "text", required: true },
                    { key: "standard",   label: "Standard",        type: "text", required: true },
                    { key: "precision",  label: "Precision",       type: "text", required: true },
                    { key: "best",       label: "Best capability", type: "text", required: true },
                    { key: "inspection", label: "Inspection",      type: "text" }
                ]
            }
        }
    },

    "finishing": {
        label: "Surface Finishing",
        collections: (function () {
            var fields = [
                { key: "title",        label: "Title",        type: "text", required: true },
                { key: "icon",         label: "Icon class",   type: "text", hint: "e.g. fas fa-shield-alt" },
                { key: "description",  label: "Description",  type: "textarea" },
                { key: "features",     label: "Features (one per line)", type: "textarea" },
                { key: "applications", label: "Applications", type: "text" }
            ];
            var groups = {
                "electroplating": "Electroplating",
                "chemical-treatment": "Chemical Treatment",
                "anodizing": "Anodizing",
                "heat-treatment": "Heat Treatment & Surface Hardening",
                "mechanical": "Mechanical Treatment",
                "marking-printing": "Marking & Printing",
                "other-specialty": "Other Specialty Treatments"
            };
            var c = {};
            Object.keys(groups).forEach(function (k) {
                c[k] = { label: groups[k], itemLabel: "Process", fields: fields };
            });
            return c;
        })()
    }
};
