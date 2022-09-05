import React from "react";
import { connect } from "react-redux";
import { updateSetting } from "../../redux/actions/index";
import { Container, Form, Button } from "semantic-ui-react";
import $ from "jquery";

import LocalizationService from "../../services/LocalizationService";

import Section from "./Screen/Section";

class Screen extends React.Component {
	componentWillMount() {
		this.setState({
			saving : false
		});
	}

	render() {
		let sections   = [];
		let save_class = (this.state.saving) ? "loading" : "";

		for (let i in this.props.sections) {
			let section_data = this.props.sections[i];

			if (section_data.exclude_modes && section_data.exclude_modes.indexOf(this.props.mode) !== -1) {
				continue;
			}
			
			sections.push(
				<Container fluid key={this.props.path + "-settings-" + i} className="section-container">
					<Section data={section_data} parent_path={this.props.path} index={i} settings={this.props.settings} mode={this.props.mode} changeCallback={this.handleChange.bind(this)}/>
				</Container>
			)
		}

		return(
			<Form>
				<Button floated="right" className={"save " + save_class} onClick={this.handleSave.bind(this)}>{LocalizationService.getMisc("save")}</Button>
				<div className="clear"></div>
				{sections}
			</Form>
		);
	}

	handleChange(e, data) {
		let key_path = data.key_path;

		if (data.selection && (data.multiple || data.drag)) {
			setTimeout(
				() => {
					let new_value = [];
					
					Array.prototype.forEach.call(document.getElementById(key_path).getElementsByTagName("a"), (el) => {
						new_value.push($(el).attr("value"));
					});
					
					this.props.new_settings[key_path] = new_value;
				},
				100
			);
		} else {
			switch (key_path) {
				case "spells_mode.ui.sectionsz":
					for (let uuid in data.value) {
						let tmp_data     = data.value[uuid];
						let tmp_key_path = `${key_path}.${uuid}`;

						this.props.new_settings[`${tmp_key_path}.types`]                 = tmp_data.types;
						this.props.new_settings[`${tmp_key_path}.layout.layout`]         = tmp_data.layout.layout;
						this.props.new_settings[`${tmp_key_path}.layout.spells_per_row`] = tmp_data.layout.spells_per_row;
					}

					break;

				default:
					let new_value = data.value || data.checked;
			
					this.props.new_settings[key_path] = new_value;
					
					break;
			}
		}
	}
	

	handleSave() {
		this.setState({
			saving : true
		});

		let action = {
			key    : [],
			value  : [],
			source : "screen-component"
		}

		for (let key_path in this.props.new_settings) {
			action.key.push(key_path);
			action.value.push(this.props.new_settings[key_path]);
		}

		this.props.updateSetting(action);
		setTimeout(
			() => {
				this.setState({
					saving : false
				});
			},
			400
		);
	}
}

const mapDispatchToProps = (dispatch) => {
	return {
		updateSetting : (data) => {
			dispatch(updateSetting(data));
		}
	}
};

const mapStateToProps = (state) => {
	return {
		settings     : state.settings,
		new_settings : {}
	};
};

export default connect(mapStateToProps, mapDispatchToProps)(Screen);