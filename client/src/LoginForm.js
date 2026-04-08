import React from "react";
import "./LoginForm.css";

function LoginForm({
  formValues = { user_name: "", user_password: "" },
  formErrors = {},
  handleChange,
  handleSubmit,
  isSubmit,
}) {
  return (
    <div className="formContainer">
      <form onSubmit={(e) => handleSubmit(e)}>
        <h1>WAVE Information</h1>
        <hr />
        <div className="uiForm">
          <div className="formField">
            <label>ユーザー名</label>
            <input
              type="text"
              placeholder="ユーザー名"
              name="user_name"
              value={formValues.user_name}
              onChange={(e) => handleChange(e)}
            />
          </div>
          <p className="errorMsg">{formErrors.user_name}</p>
          <div className="formField">
            <label>パスワード</label>
            <input
              type="password"
              placeholder="パスワード"
              name="user_password"
              value={formValues.user_password}
              onChange={(e) => handleChange(e)}
            />
          </div>
          <p className="errorMsg">{formErrors.user_password}</p>
          <button className="submitButton">ログイン</button>
        </div>
      </form>
    </div>
  );
}

export default LoginForm;
