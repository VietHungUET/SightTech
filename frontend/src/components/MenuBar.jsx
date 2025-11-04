import {NavLink} from "react-router-dom";
import "./MenuBar.css"

export default function MenuBar() {
    return (
        <nav>
            <div>Logo</div>
            <NavLink to="/">Home</NavLink>
            <NavLink to="/image">Image</NavLink>
            <NavLink to="/music">Music</NavLink>
            <NavLink to="/chatbot">Chatbot</NavLink>
            <NavLink to="/news">News</NavLink>
        </nav>
    )
}