import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Header from "./Header";

test("WavePilotのロゴが表示される", () => {
  render(
    <BrowserRouter>
      <Header username="test" onLogout={() => {}} />
    </BrowserRouter>,
  );

  expect(screen.getByText("WavePilot")).toBeInTheDocument();
});
