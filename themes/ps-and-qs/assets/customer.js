/* Address forms: toggle + country/province selects */
(function () {
  document.querySelectorAll('[data-address-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.getElementById(btn.getAttribute('data-address-toggle'));
      if (el) el.hidden = !el.hidden;
    });
  });
  document.querySelectorAll('[data-address-country-select]').forEach(function (countrySel) {
    var id = countrySel.getAttribute('data-address-id');
    var provSel = document.getElementById('AddressProvince_' + id);
    var container = document.getElementById('AddressProvinceContainer_' + id);
    if (!provSel) return;
    function update() {
      var opt = countrySel.options[countrySel.selectedIndex];
      var provinces = JSON.parse(opt.getAttribute('data-provinces') || '[]');
      provSel.innerHTML = '';
      if (!provinces.length) { container.hidden = true; return; }
      container.hidden = false;
      provinces.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p[0]; o.textContent = p[1];
        if (p[0] === provSel.getAttribute('data-default')) o.selected = true;
        provSel.appendChild(o);
      });
    }
    var def = countrySel.getAttribute('data-default');
    if (def) { Array.from(countrySel.options).forEach(function (o) { if (o.value === def) o.selected = true; }); }
    countrySel.addEventListener('change', update);
    update();
  });
})();
