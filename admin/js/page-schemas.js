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
    }

    // Add more pages below as they are converted, e.g.:
    // "cnc-turning":  { label: "CNC Turning",  collections: { equipment: {...} } },
    // "finishing":    { label: "Surface Finishing", collections: { processes: {...} } },
};
