/**
 * Chan canh bao "Changes you made may not be saved" cua trinh duyet.
 *
 * Hop thoai do la giao dien NATIVE cua Chrome, nam ngoai DOM — khong mot script
 * nao bam duoc vao no. Chi can o soan thao con chu la X dang ky beforeunload,
 * va tu do moi location.reload() cua bot deu dung sung cho nguoi bam tay.
 *
 * File nay tach rieng khoi content.js vi phai chay trong MAIN world: content
 * script thuong nam o the gioi cach ly, va la mot the gioi KHAC hoan toan — va
 * nhu vay thi EventTarget.prototype o do khong phai cai ma X dang dung, vo lam
 * trong do khong cham duoc den listener cua X. Doi lai, MAIN world khong co
 * chrome.runtime, nen content.js khong o chung day duoc.
 *
 * Doi lai: ban nhap that cua nguoi dung trong tab nay se khong con duoc hoi
 * truoc khi mat. Tab nay la tab cua bot nen danh chiu.
 */
(function blockUnloadPrompt() {
  'use strict';
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (type === 'beforeunload') return undefined;
    return add.call(this, type, ...rest);
  };
  try {
    Object.defineProperty(window, 'onbeforeunload', {
      configurable: true, get: () => null, set: () => {},
    });
  } catch { /* trinh duyet khong cho ghi de thi thoi */ }
})();
