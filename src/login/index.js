(function initializeReelayLogin() {
  const form = document.querySelector("#loginForm");
  const accountInput = document.querySelector("#loginAccount");
  const passwordInput = document.querySelector("#loginPassword");
  const togglePassword = document.querySelector("#togglePassword");
  const submitButton = document.querySelector("#loginSubmit");
  const errorMessage = document.querySelector("#loginError");
  const googleLogin = document.querySelector("#googleLogin");
  const notice = document.querySelector("#loginNotice");
  let noticeTimer = 0;

  function refreshIcons() {
    if (!window.lucide) return;
    window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }

  function loadTheme() {
    try {
      const savedTheme = localStorage.getItem("reelay-theme-mode");
      if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
      if (savedTheme === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      // Storage access is optional for this static login prototype.
    }
    return "light";
  }

  function setPasswordVisible(visible) {
    if (!passwordInput || !togglePassword) return;
    passwordInput.type = visible ? "text" : "password";
    togglePassword.setAttribute("aria-pressed", String(visible));
    togglePassword.setAttribute("aria-label", visible ? "隐藏密码" : "显示密码");
    togglePassword.innerHTML = `<i data-lucide="${visible ? "eye-off" : "eye"}" aria-hidden="true"></i>`;
    refreshIcons();
  }

  function showError(message, input) {
    if (!errorMessage) return;
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    input?.setAttribute("aria-invalid", "true");
    input?.setAttribute("aria-describedby", "loginError");
    input?.focus();
  }

  function clearError() {
    if (errorMessage) errorMessage.hidden = true;
    [accountInput, passwordInput].forEach((input) => {
      input?.removeAttribute("aria-invalid");
      input?.removeAttribute("aria-describedby");
    });
  }

  function showNotice(message, duration = 3000) {
    if (!notice) return;
    window.clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.dataset.visible = "true";
    noticeTimer = window.setTimeout(() => {
      notice.dataset.visible = "false";
    }, duration);
  }

  document.documentElement.dataset.theme = loadTheme();

  togglePassword?.addEventListener("click", () => {
    setPasswordVisible(passwordInput?.type === "password");
  });

  accountInput?.addEventListener("input", clearError);
  passwordInput?.addEventListener("input", clearError);

  googleLogin?.addEventListener("click", () => {
    showNotice("Google 登录目前是界面演示，将在正式账户系统阶段接入。");
  });

  document.querySelectorAll("[data-prototype-message]").forEach((control) => {
    control.addEventListener("click", () => showNotice(control.dataset.prototypeMessage));
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    clearError();
    if (!accountInput?.value.trim()) {
      showError("请输入演示账号。", accountInput);
      return;
    }
    if (!passwordInput?.value) {
      showError("请输入演示密码。", passwordInput);
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.querySelector("span").textContent = "正在进入…";
    }
    window.setTimeout(() => window.location.assign("./home.html"), 260);
  });

  refreshIcons();
  window.setTimeout(() => {
    showNotice("已暂时填入演示账号，可直接登录。请勿输入真实账号密码。", 3600);
  }, 260);
})();
