export function passwordRules(password: string) {
  return [
    { label: "Pelo menos 8 caracteres", valid: password.length >= 8 },
    { label: "Uma letra maiúscula", valid: /[A-Z]/.test(password) },
    { label: "Uma letra minúscula", valid: /[a-z]/.test(password) },
    { label: "Um número", valid: /[0-9]/.test(password) },
    { label: "Um caractere especial", valid: /[^A-Za-z0-9\s]/.test(password) },
  ];
}
export function validPassword(password: string) {
  return (
    password.length <= 128 &&
    passwordRules(password).every((rule) => rule.valid)
  );
}
