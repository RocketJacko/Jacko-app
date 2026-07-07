import { RegisterForm } from "../components/auth/RegisterForm";
import "./RegisterPage.css";

export function RegisterPage() {
  return (
    <section id="register" className="register-section">
      <div className="register-container">
        <div className="register-form-wrapper">
          <RegisterForm />
        </div>
      </div>
    </section>
  );
}
