/**
 * WFX Admin — Image Cropper
 * ─────────────────────────────────────────────────────────────────────────
 * A small, dependency-light wrapper around Cropper.js that pops a modal so an
 * admin can crop / resize / rotate an image before uploading. Cropper.js is
 * lazy-loaded from the CDN on first use, so pages that never crop pay nothing.
 *
 * Usage:
 *   const result = await WFXImageCropper.open(file, { ratio: 16/9, label: '...' });
 *   // result === a cropped File   → upload this
 *   // result === the original File → user chose "Use original"
 *   // result === null              → user cancelled (do nothing)
 *
 * Aspect-ratio presets match the site's image slots (see the size guide):
 *   16:9 (hero / news), 4:3 (service & industry cards), 3:2, 1:1 (avatars), Free.
 * The server still converts the uploaded result to WebP, so output format here
 * only needs to preserve quality (PNG keeps transparency; others use JPEG).
 */
(function () {
    var CROPPER_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css';
    var CROPPER_JS  = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js';

    function loadCropper() {
        return new Promise(function (resolve, reject) {
            if (window.Cropper) { resolve(); return; }
            if (!document.querySelector('link[data-wfx-cropper]')) {
                var link = document.createElement('link');
                link.rel = 'stylesheet'; link.href = CROPPER_CSS;
                link.setAttribute('data-wfx-cropper', '1');
                document.head.appendChild(link);
            }
            var existing = document.querySelector('script[data-wfx-cropper]');
            if (existing) {
                existing.addEventListener('load', function () { resolve(); });
                existing.addEventListener('error', reject);
                if (window.Cropper) resolve();
                return;
            }
            var sc = document.createElement('script');
            sc.src = CROPPER_JS; sc.setAttribute('data-wfx-cropper', '1');
            sc.onload = function () { resolve(); };
            sc.onerror = reject;
            document.head.appendChild(sc);
        });
    }

    function injectStylesOnce() {
        if (document.getElementById('wfx-crop-style')) return;
        var s = document.createElement('style');
        s.id = 'wfx-crop-style';
        s.textContent =
            '.wfx-crop-overlay{position:fixed;inset:0;background:rgba(15,23,42,.72);z-index:99999;' +
            'display:flex;align-items:center;justify-content:center;padding:20px;}' +
            '.wfx-crop-modal{background:#fff;border-radius:14px;width:min(820px,96vw);max-height:94vh;' +
            'display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);}' +
            '.wfx-crop-head{padding:16px 20px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#0f172a;' +
            'display:flex;justify-content:space-between;align-items:center;}' +
            '.wfx-crop-head small{font-weight:400;color:#64748b;}' +
            '.wfx-crop-body{padding:14px 20px;overflow:auto;}' +
            '.wfx-crop-stage{max-height:54vh;background:#0f172a;border-radius:8px;}' +
            '.wfx-crop-stage img{max-width:100%;display:block;}' +
            '.wfx-crop-tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center;}' +
            '.wfx-crop-tools .lbl{font-size:.8rem;color:#64748b;margin-right:2px;}' +
            '.wfx-crop-chip{padding:6px 12px;border:1px solid #cbd5e1;border-radius:20px;background:#fff;' +
            'cursor:pointer;font-size:.85rem;color:#334155;}' +
            '.wfx-crop-chip.active{background:#0052CC;border-color:#0052CC;color:#fff;}' +
            '.wfx-crop-icon{padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;color:#334155;}' +
            '.wfx-crop-foot{padding:14px 20px;border-top:1px solid #e5e7eb;display:flex;gap:10px;justify-content:flex-end;}' +
            '.wfx-crop-foot button{padding:9px 16px;border-radius:8px;font-size:.9rem;cursor:pointer;border:1px solid transparent;}' +
            '.wfx-btn-apply{background:#0052CC;color:#fff;}' +
            '.wfx-btn-orig{background:#fff;border-color:#cbd5e1;color:#334155;}' +
            '.wfx-btn-cancel{background:#fff;border-color:#cbd5e1;color:#64748b;}' +
            '.wfx-crop-dim{font-size:.8rem;color:#64748b;margin-left:auto;}';
        document.head.appendChild(s);
    }

    var PRESETS = [
        { label: 'Free',  value: NaN },
        { label: '16:9',  value: 16 / 9 },
        { label: '4:3',   value: 4 / 3 },
        { label: '3:2',   value: 3 / 2 },
        { label: '1:1',   value: 1 }
    ];

    function open(file, opts) {
        opts = opts || {};
        return loadCropper().then(function () {
            injectStylesOnce();
            return new Promise(function (resolve) {
                var url = URL.createObjectURL(file);
                var overlay = document.createElement('div');
                overlay.className = 'wfx-crop-overlay';

                var chips = PRESETS.map(function (p, i) {
                    var active = (opts.ratio && Math.abs((opts.ratio || 0) - p.value) < 0.01) ||
                                 (!opts.ratio && i === 0);
                    return '<button type="button" class="wfx-crop-chip' + (active ? ' active' : '') +
                        '" data-ratio="' + (isNaN(p.value) ? 'free' : p.value) + '">' + p.label + '</button>';
                }).join('');

                overlay.innerHTML =
                    '<div class="wfx-crop-modal" role="dialog" aria-modal="true">' +
                      '<div class="wfx-crop-head"><span>裁剪图片 / Crop image' +
                        (opts.label ? ' <small>· ' + opts.label + '</small>' : '') + '</span></div>' +
                      '<div class="wfx-crop-body">' +
                        '<div class="wfx-crop-stage"><img class="wfx-crop-img" alt=""></div>' +
                        '<div class="wfx-crop-tools">' +
                          '<span class="lbl">比例 Ratio:</span>' + chips +
                          '<button type="button" class="wfx-crop-icon" data-act="rotate" title="Rotate"><i class="fas fa-rotate-right"></i></button>' +
                          '<button type="button" class="wfx-crop-icon" data-act="reset" title="Reset"><i class="fas fa-arrows-rotate"></i></button>' +
                          '<span class="wfx-crop-dim"></span>' +
                        '</div>' +
                      '</div>' +
                      '<div class="wfx-crop-foot">' +
                        '<button type="button" class="wfx-btn-cancel">取消 / Cancel</button>' +
                        '<button type="button" class="wfx-btn-orig">用原图 / Use original</button>' +
                        '<button type="button" class="wfx-btn-apply">裁剪并使用 / Crop &amp; use</button>' +
                      '</div>' +
                    '</div>';
                document.body.appendChild(overlay);

                var img = overlay.querySelector('.wfx-crop-img');
                var dim = overlay.querySelector('.wfx-crop-dim');
                img.src = url;

                var cropper = new Cropper(img, {
                    viewMode: 1, autoCropArea: 1, background: true, responsive: true,
                    aspectRatio: (opts.ratio || NaN),
                    crop: function (e) {
                        dim.textContent = Math.round(e.detail.width) + ' × ' + Math.round(e.detail.height) + ' px';
                    }
                });

                overlay.querySelectorAll('[data-ratio]').forEach(function (b) {
                    b.addEventListener('click', function () {
                        overlay.querySelectorAll('[data-ratio]').forEach(function (x) { x.classList.remove('active'); });
                        b.classList.add('active');
                        var r = b.getAttribute('data-ratio');
                        cropper.setAspectRatio(r === 'free' ? NaN : parseFloat(r));
                    });
                });
                overlay.querySelector('[data-act="rotate"]').addEventListener('click', function () { cropper.rotate(90); });
                overlay.querySelector('[data-act="reset"]').addEventListener('click', function () { cropper.reset(); });

                function cleanup() { try { cropper.destroy(); } catch (e) {} URL.revokeObjectURL(url); overlay.remove(); }

                overlay.querySelector('.wfx-btn-cancel').addEventListener('click', function () { cleanup(); resolve(null); });
                overlay.querySelector('.wfx-btn-orig').addEventListener('click', function () { cleanup(); resolve(file); });
                overlay.querySelector('.wfx-btn-apply').addEventListener('click', function () {
                    var canvas = cropper.getCroppedCanvas({ maxWidth: 4096, maxHeight: 4096, imageSmoothingQuality: 'high' });
                    if (!canvas) { cleanup(); resolve(file); return; }
                    var type = (file.type === 'image/png') ? 'image/png' : 'image/jpeg';
                    canvas.toBlob(function (blob) {
                        cleanup();
                        if (!blob) { resolve(file); return; }
                        var base = (file.name || 'image').replace(/\.[^.]+$/, '');
                        var name = base + (type === 'image/png' ? '.png' : '.jpg');
                        try {
                            resolve(new File([blob], name, { type: type }));
                        } catch (e) {
                            blob.name = name; resolve(blob);   // older browsers without File ctor
                        }
                    }, type, 0.92);
                });
            });
        }).catch(function () {
            // Cropper failed to load (offline / blocked) — fall back to original file
            return file;
        });
    }

    window.WFXImageCropper = { open: open };
})();
