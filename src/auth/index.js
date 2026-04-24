import { els, state } from "../core/state.js";
import { formatCpf, formatPhone, isAdult, isValidCpf, onlyDigits } from "../core/utils.js";

export function createAuthModule(deps) {
  function renderAuthGate(message) {
    const isLogged = Boolean(state.currentUser) && !state.isPasswordRecovery;
    document.body.classList.remove("auth-loading");
    els.authScreen.classList.toggle("is-hidden", isLogged);
    els.appShell.classList.toggle("is-hidden", !isLogged);
    els.sidebar.classList.toggle("is-hidden", !isLogged);
    if (message) els.authNote.textContent = message;
    else if (!state.cloudReady) els.authNote.textContent = "Preparando acesso...";
    else els.authNote.textContent = isLogged ? "Sessao conectada." : "Entre para continuar.";
  }

  function isEmailConfirmed(user) {
    return Boolean(user?.email_confirmed_at || user?.confirmed_at);
  }

  function showAuthView(view) {
    state.authView = view;
    const isSignup = view === "signup";
    const isReset = view === "reset";
    const isUpdatePassword = view === "update-password";
    document.querySelector("#login-form").classList.toggle("is-hidden", isSignup || isReset || isUpdatePassword);
    document.querySelector("#signup-form").classList.toggle("is-hidden", !isSignup);
    document.querySelector("#reset-form").classList.toggle("is-hidden", !isReset);
    document.querySelector("#update-password-form").classList.toggle("is-hidden", !isUpdatePassword);
    els.authTitle.textContent = isSignup
      ? "Crie sua conta"
      : isReset
        ? "Recupere sua senha"
        : isUpdatePassword
          ? "Defina uma nova senha"
          : "Acesse sua conta";
    els.authNote.textContent = isSignup
      ? "Preencha seus dados para criar o acesso."
      : isReset
        ? "Enviaremos um link para redefinir sua senha."
        : isUpdatePassword
          ? "Informe a nova senha para concluir a recuperacao."
          : "Entre para continuar.";
  }

  function getAuthCredentials() {
    return {
      email: document.querySelector("#login-email")?.value.trim() || "",
      password: document.querySelector("#login-password")?.value || "",
    };
  }

  function getSignupProfile() {
    return {
      fullName: document.querySelector("#signup-name").value.trim(),
      cpf: onlyDigits(document.querySelector("#signup-cpf").value),
      phone: document.querySelector("#signup-phone").value.trim(),
      birthdate: document.querySelector("#signup-birthdate").value,
      email: document.querySelector("#signup-email").value.trim(),
      password: document.querySelector("#signup-password").value,
    };
  }

  function validateAuthInput(email, password) {
    if (!email || !password) return "Informe e-mail e senha.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Informe um e-mail valido.";
    if (password.length < 6) return "A senha deve ter pelo menos 6 caracteres.";
    return "";
  }

  function validateSignupProfile(profile) {
    if (!profile.fullName || profile.fullName.split(" ").length < 2) return "Informe seu nome completo.";
    if (!isValidCpf(profile.cpf)) return "Informe um CPF valido.";
    if (onlyDigits(profile.phone).length < 10) return "Informe um telefone valido.";
    if (!profile.birthdate) return "Informe sua data de nascimento.";
    if (!isAdult(profile.birthdate)) return "Cadastro permitido apenas para maiores de 18 anos.";
    return validateAuthInput(profile.email, profile.password);
  }

  async function requestPasswordReset(event) {
    if (event) event.preventDefault();
    if (!(await deps.ensureSupabaseReady())) return;
    const email = document.querySelector("#reset-email").value.trim();
    if (!email) return deps.notify("Informe seu e-mail.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return deps.notify("Informe um e-mail valido.");

    const { error } = await state.supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
    if (error) return deps.notify(error.message);
    showAuthView("login");
    document.querySelector("#login-email").value = email;
    renderAuthGate("Verifique seu e-mail para redefinir a senha.");
    deps.notify("Link de recuperacao enviado.");
  }

  async function updatePassword(event) {
    if (event) event.preventDefault();
    if (!(await deps.ensureSupabaseReady())) return;
    const password = document.querySelector("#update-password").value;
    const confirmPassword = document.querySelector("#update-password-confirm").value;
    if (password.length < 6) return deps.notify("A senha deve ter pelo menos 6 caracteres.");
    if (password !== confirmPassword) return deps.notify("As senhas nao conferem.");

    const { error } = await state.supabaseClient.auth.updateUser({ password });
    if (error) return deps.notify(error.message);

    state.isPasswordRecovery = false;
    await state.supabaseClient.auth.signOut();
    state.currentUser = null;
    document.querySelector("#update-password").value = "";
    document.querySelector("#update-password-confirm").value = "";
    location.hash = "";
    showAuthView("login");
    renderAuthGate("Senha atualizada. Entre com a nova senha.");
    deps.notify("Senha atualizada com sucesso.");
  }

  async function signInSupabase(event) {
    if (event) event.preventDefault();
    if (!(await deps.ensureSupabaseReady())) return;
    const credentials = getAuthCredentials();
    const validationError = validateAuthInput(credentials.email, credentials.password);
    if (validationError) return deps.notify(validationError);

    const { data, error } = await state.supabaseClient.auth.signInWithPassword(credentials);
    if (error) return deps.notify(error.message);
    if (!isEmailConfirmed(data.user)) {
      await state.supabaseClient.auth.signOut();
      state.currentUser = null;
      renderAuthGate("Confirme seu e-mail antes de entrar.");
      return deps.notify("Confirme seu e-mail antes de entrar.");
    }
    state.currentUser = data.user;
    renderAuthGate();
    deps.renderCloudStatus();
    await deps.saveUserProfileFromMetadata(data.user);
    await deps.pullFromSupabase({ silent: true });
    deps.notify("Login conectado.");
    deps.renderCloudStatus();
  }

  async function signUpSupabase() {
    if (!(await deps.ensureSupabaseReady())) return;
    const profile = getSignupProfile();
    const validationError = validateSignupProfile(profile);
    if (validationError) return deps.notify(validationError);

    const { error } = await state.supabaseClient.auth.signUp({
      email: profile.email,
      password: profile.password,
      options: {
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        data: {
          full_name: profile.fullName,
          cpf: profile.cpf,
          phone: profile.phone,
          birthdate: profile.birthdate,
        },
      },
    });
    if (error) return deps.notify(error.message);
    await state.supabaseClient.auth.signOut();
    state.currentUser = null;
    showAuthView("login");
    document.querySelector("#login-email").value = profile.email;
    renderAuthGate("Conta criada. Verifique seu e-mail para confirmar o acesso.");
    deps.notify("Conta criada. Verifique seu e-mail.");
  }

  async function signOutSupabase() {
    if (state.supabaseClient) await state.supabaseClient.auth.signOut();
    window.clearTimeout(state.syncTimer);
    state.isPasswordRecovery = false;
    state.currentUser = null;
    state.isSyncing = false;
    state.search = "";
    document.querySelector("#login-password").value = "";
    document.querySelector("#signup-password").value = "";
    location.hash = "";
    showAuthView("login");
    renderAuthGate("Sessao encerrada.");
    deps.renderCloudStatus();
    deps.notify("Sessao encerrada.");
  }

  return {
    renderAuthGate,
    isEmailConfirmed,
    showAuthView,
    getAuthCredentials,
    getSignupProfile,
    validateAuthInput,
    validateSignupProfile,
    requestPasswordReset,
    updatePassword,
    signInSupabase,
    signUpSupabase,
    signOutSupabase,
    formatCpf,
    formatPhone,
  };
}
