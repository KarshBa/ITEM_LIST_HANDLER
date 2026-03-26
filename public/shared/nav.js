// shared/nav.js
(() => {
  const NAV_HTML = `
  <div class="menu" role="navigation" aria-label="Primary">
	<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu-list">
	☰ Menu
	</button>
	  
	<ul id="menu-list">
      <ul id="menu-list">
      <li>
        <a href="https://inventory-counts.onrender.com/admin_home.html">Home</a>
      </li>

	  <li>
        <a href="#">Quick ▾</a>
        <ul>
		  <li>
            <a href="https://item-list-handler.onrender.com/item_list.html">
              Item Search
            </a>
          </li>
          <li>
            <a href="https://inventory-counts.onrender.com/simplelist.html">
              List Tool
            </a>
          </li>
		  <li>
            <a href="https://qr-generator-3794.onrender.com/floor_map.html">
              Floor Map
            </a>
          </li>
          <li>
            <a href="https://inventory-counts.onrender.com/user_home.html">
              User Page
            </a>
          </li>
        </ul>
      </li>

      <li>
        <a href="#">Movement / Sales ▾</a>
        <ul>
          <li>
            <a href="https://movement-3ka5.onrender.com/item_movement.html">
              Movement
            </a>
          </li>
		  <li>
            <a href="https://movement-3ka5.onrender.com/non_movement.html">
              Non-Movement
            </a>
          </li>
          <li>
            <a href="https://movement-3ka5.onrender.com/department_sales.html">
              Last Week Sales
            </a>
          </li>
		  <li>
            <a href="https://movement-3ka5.onrender.com/vendor_review.html">
              Vendor Review
            </a>
          </li>
		  <li>
            <a href="https://movement-3ka5.onrender.com/">
              Movement Admin
            </a>
          </li>
        </ul>
      </li>

      <li>
        <a href="#">Shrink ▾</a>
        <ul>
          <li>
            <a href="https://inventory-app-bxr3.onrender.com/user.html">
              Shrink (User)
            </a>
          </li>
          <li>
            <a href="https://inventory-app-bxr3.onrender.com/admin.html">
              Shrink Admin
            </a>
          </li>
        </ul>
      </li>

      <li>
        <a href="#">Price Changes ▾</a>
        <ul>
          <li>
            <a href="https://sales-batches-app.onrender.com">
              Price Changes
            </a>
          </li>
        </ul>
      </li>

	  <li>
        <a href="#">Purchasing ▾</a>
        <ul>
          <li>
            <a href="https://hq.geniuscentral.com/login">
              Genius Central
            </a>
          </li>
          <li>
            <a href="https://myunfi.com/">
              MyUNFI
            </a>
          </li>
          <li>
            <a href="https://connect.kehe.com/callback/login">
              KeHe
            </a>
          </li>
          <li>
            <a href="https://www.performancefoodservice.com/Company/Sign-In">
              Performance
            </a>
          </li>
		  <li>
            <a href="https://www.ncg.coop/">
              NCG.coop
            </a>
          </li>
		  <li>
            <a href="https://ncga-coop.csod.com/login/render.aspx?id=defaultclp">
              Coop-U
            </a>
          </li>
        </ul>
      </li>
	  
	  <li>
        <a href="#">Item Maintenance ▾</a>
        <ul>
          <li>
            <a href="https://inventory-counts.onrender.com/open_scale_plu.html">
              Scale PLU / Scale Plus
            </a>
          </li>
          <li>
            <a href="https://item-list-handler.onrender.com">
              Master Item List
            </a>
          </li>
		  <li>
            <a href="https://sales-batches-app.onrender.com/ncg_product_hierarchy.html">
              NCG Product Hierarchy
            </a>
          </li>
        </ul>
      </li>

	  <li>
        <a href="#">Inventory ▾</a>
        <ul>
          <li>
            <a href="https://inventory-counts.onrender.com/user.html">
              Inventory Counts (User)
            </a>
          </li>
          <li>
            <a href="https://inventory-counts.onrender.com/admin.html">
              Inventory Counts (Admin)
            </a>
          </li>
        </ul>
      </li>
	  
	  <li>
        <a href="#">Utilities ▾</a>
        <ul>
          <li>
            <a href="https://qr-generator-3794.onrender.com/">
              QR Code Generator
            </a>
          </li>
		      <li>
            <a href="https://scan-sheet-builder.onrender.com/">
              Scan Sheet Generator
            </a>
          </li>
          <li>
            <a href="https://free-radio-qz75.onrender.com/">
              Free-Radio
            </a>
          </li>
        </ul>
      </li>

    </ul>
  </div>
  `.trim();

  // If a mount point exists, use it; otherwise insert at top of body
  const mount = document.getElementById("nav-mount");
  let menuEl;

  if (mount) {
    mount.innerHTML = NAV_HTML;
    menuEl = mount.querySelector(".menu");
  } else {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = NAV_HTML;
    document.body.insertBefore(wrapper.firstElementChild, document.body.firstChild);
    menuEl = document.body.firstElementChild;
  }

  // --- Mobile toggle behavior ---
  const btn = menuEl.querySelector(".menu-toggle");
  const list = menuEl.querySelector("#menu-list");

  function setExpanded(isOpen) {
    menuEl.classList.toggle("is-open", isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  btn.addEventListener("click", () => {
    setExpanded(!menuEl.classList.contains("is-open"));
  });

  // Tap-to-open submenus on mobile (for items that have a nested <ul>)
  menuEl.querySelectorAll(":scope > ul > li > a").forEach((a) => {
    const li = a.parentElement;
    const submenu = li && li.querySelector(":scope > ul");
    if (!submenu) return;

    a.addEventListener("click", (e) => {
      // Only intercept the placeholder “#” top-level links
      if (a.getAttribute("href") === "#") {
        e.preventDefault();
        li.classList.toggle("submenu-open");
      }
    });
  });

  // Close the whole menu after choosing a real link (optional but nice on mobile)
  menuEl.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    if (a.getAttribute("href") && a.getAttribute("href") !== "#") {
      setExpanded(false);
    }
  });

  // If user rotates / resizes into desktop, ensure menu isn’t stuck “open”
  window.addEventListener("resize", () => {
    if (window.innerWidth > 700) {
      setExpanded(false);
      menuEl.querySelectorAll(".submenu-open").forEach((li) => li.classList.remove("submenu-open"));
    }
  });
})();
