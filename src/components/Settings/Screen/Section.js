import React from "react";
import { Header, Form, Select, Input, TextArea, Checkbox } from "semantic-ui-react";
import Editor from "react-simple-code-editor";
import Sortable from "sortablejs/modular/sortable.core.esm.js";

import LocalizationService from "../../../services/LocalizationService";

import MetricNameTable from "./Inputs/Table/MetricNameTable";
import TTSRulesTable from "./Inputs/Table/TTSRulesTable";
import SpellsUITable from "./Inputs/Table/SpellsUITable";
import Slider from "./Inputs/Slider";
import ObjectService from "../../../services/ObjectService";

class Section extends React.Component {
	constructor() {
		super();

		this.state = {};
	}

	getSettingValue(setting_data) {
		return (typeof setting_data.value === "function")
			? setting_data.value.call(this, this)
			: ObjectService.getByKeyPath(this.props.settings, setting_data.key_path);
	}

	componentWillMount() {
		let state_data = {};

		for (let setting_data of this.props.data.settings) {
			let value = this.getSettingValue(setting_data);

			state_data[setting_data.key_path] = value;
		}

		this.setState(state_data);
	}
	
	componentDidMount() {
		Array.prototype.forEach.call(document.querySelectorAll(".multiple.selection.standalone"), (el) => {
			Sortable.create(
				el,
				{
					draggable: "a",
					onUpdate: (evt, originalEvent) => {
						this.handleChange(evt, true);
					}
				}
			);
		});
	}

	render() {
		let settings = [];
		let info     = (this.props.data.info)
			? <p>{this.props.data.info()}</p>
			: "";
		// let language = this.props.settings.interface.language;

		for (let setting_data of this.props.data.settings) {
			if (setting_data.exclude_modes && setting_data.exclude_modes.indexOf(this.props.mode) !== -1) {
				continue;
			}

			let setting;

			let label_text = LocalizationService.getSettingText(setting_data.locale || setting_data.key_path) || "";
			let label      = (label_text) ? <label>{label_text}</label> : "";
			let value      = this.getSettingValue(setting_data);

			switch (setting_data.type) {
				case "select":
					if (!value) {
						value = [];
					}

					let options = (typeof setting_data.options === "function") ? setting_data.options() : setting_data.options;

					setting = <Select fluid labeled multiple={setting_data.multiple || false} search={setting_data.search || false}
						className="standalone"
						options={options}
						defaultValue={value}
						key_path={setting_data.key_path}
						id={setting_data.key_path}
						onChange={this.props.changeCallback}/>;

					break;

				case "textbox":
					setting = <Input defaultValue={value} fluid={setting_data.fluid} key_path={setting_data.key_path} onChange={this.props.changeCallback}/>;

					break;

				case "textarea":
					setting = <TextArea defaultValue={value} key_path={setting_data.key_path} rows={20} onChange={this.props.changeCallback}/>;

					break;

				case "code":
					let key_path = setting_data.key_path;

					setting = <Editor
						className="code"
						value={this.state[key_path]}
						key_path={setting_data.key_path}
						onValueChange={(code) => {
							this.props.changeCallback({}, {key_path : setting_data.key_path, value : code});

							let state_data = {};

							state_data[key_path] = code;

							this.setState(state_data);
						}}
						highlight={code => code}/>;

					break;

				case "checkbox":
					setting = <Checkbox toggle label={label} defaultChecked={value} key_path={setting_data.key_path} onChange={this.props.changeCallback}/>;
					label   = "";

					break;

				case "slider":
					let range = setting_data.range || "min";
					let min   = setting_data.minimum || 0;
					let max   = setting_data.maximum || 100;

					label = <label>{label_text}: <span className="value">{value}</span></label>;

					setting = <Slider range={range} minimum={min} maximum ={max} key_path={setting_data.key_path} value={value} onChange={this.props.changeCallback}/>;

					break;

				case "MetricNameTable":
					let metric_options = setting_data.options().sort((a, b) => (a.text > b.text) ? 1 : -1);

					label   = "";
					setting = <MetricNameTable value={value} options={metric_options} key_path={setting_data.key_path} onChange={this.props.changeCallback}/>;

					break;

				case "TTSRulesTable":
					let rule_options = setting_data.options();

					setting = <TTSRulesTable value={value} options={rule_options} key_path={setting_data.key_path} onChange={this.props.changeCallback}/>;

					break;

				case "SpellsUITable":
					label   = "";
					setting = <SpellsUITable value={value} options={setting_data.options()} key_path={setting_data.key_path} onChange={this.props.changeCallback}/>;

					break;

				default:
					break;
			}

			settings.push(
				<Form.Field inline key={setting_data.key_path}>
					{label}
					{setting}
				</Form.Field>
			);
		}

		return(
			<React.Fragment>
				<Header as="h2">{LocalizationService.getSettingsSubsectionText(this.props.parent_path, this.props.index)}</Header>
				{info}
				<div>
					{settings}
				</div>
			</React.Fragment>
		);
	}
	
	handleChange(e, drag) {
		e.target.key_path  = e.target.id || e.target.getAttribute("key_path");
		e.target.selection = true;
		e.target.drag      = drag;
		
		this.props.changeCallback(e.target, e.target);
	}
}

export default Section;