import { useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginForm from "./LoginForm";
import API_BASE_URL from "./config";

function Login({ onLogin }) {
  const initialValues = { user_name: "", user_password: "" };
  const [formValues, setFormValues] = useState(initialValues);
  const [formErrors, setFormErrors] = useState({});
  const [isSubmit, setIsSubmit] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormValues({ ...formValues, [name]: value });
    console.log("[Client]", formValues);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    //ログイン情報を送信する
    //バリデーションチェック
    const errors = validate(formValues);
    setFormErrors(errors);
    setIsSubmit(true);

    try {
      console.log("[Client] 送信するデータ:", formValues);
      const response = await fetch(
        `${API_BASE_URL}/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formValues),
        },
      );

      const data = await response.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        onLogin({ id: data.id, user_name: data.user_name });
        navigate("/home");
      } else {
        alert(data.message); // 失敗のメッセージを表示
      }
    } catch (error) {
      console.error("[Client] ログインエラー:", error);
    }
  };

  const validate = (values) => {
    const errors = {};
    if (!values.user_name) {
      errors.user_name = "ユーザー名を入力してください";
    }
    if (!values.user_password) {
      errors.user_password = "パスワードを入力してください";
    } else if (values.user_password.length < 4) {
      errors.user_password =
        "4文字以上15文字以下のパスワードを入力してください";
    } else if (values.user_password.length > 15) {
      errors.user_password =
        "4文字以上15文字以下のパスワードを入力してください";
    }
    return errors;
  };

  return (
    <LoginForm
      formValues={formValues}
      formErrors={formErrors}
      handleChange={handleChange}
      handleSubmit={handleSubmit}
      isSubmit={isSubmit}
    />
  );
}

export default Login;
