import {NavLink} from "react-router-dom";
import "./MenuBar.css"
import logo from "../assets/logo.png"

export default function MenuBar() {
    return (
        <nav>
            <div className="logo-container">
                <img className="logo" src={logo} alt=""/>
            </div>
            <NavLink to="/">Home</NavLink>
            <NavLink to="/image">Image Detection</NavLink>
            <NavLink to="/music">Music Detection</NavLink>
            <NavLink to="/chatbot">Chatbot</NavLink>
            <NavLink to="/news">News</NavLink>
        </nav>
    )
}