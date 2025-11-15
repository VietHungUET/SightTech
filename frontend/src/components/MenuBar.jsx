import {NavLink} from "react-router-dom";
import "./MenuBar.css"

export default function MenuBar() {
    return (
        <nav>
            <div>Logo</div>
            <NavLink to="/">Home</NavLink>
            <NavLink to="/image">Image Detection</NavLink>
            <NavLink to="/music">Music Detection</NavLink>
            <NavLink to="/chatbot">Chatbot</NavLink>
            <NavLink to="/news">News</NavLink>
        </nav>
    )
}