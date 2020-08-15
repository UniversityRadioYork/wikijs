/* global WIKI */

const _ = require('lodash')

const MyRadioStrategy = require('@ury1350/passport-myradio')

module.exports = {
  init(passport, conf) {
    passport.use(
      'myradio',
      new MyRadioStrategy({
        ...conf,
        mixins: ['all_officerships', 'personal_data'],
        loginCallbackUrl: conf.callbackURL,
        enforceRedirect: true
      }, async (userInfo, cb) => {
        const profile = {
          id: userInfo.memberid,
          email: userInfo.public_email || userInfo.email,
          displayName: userInfo.fname + ' ' + userInfo.sname,
          picture: typeof userInfo.photo === 'string' ? (conf.websiteBaseUrl + userInfo.photo) : undefined
        }

        const user = await WIKI.models.users.processProfile({
          profile,
          providerKey: 'myradio'
        })

        const myradioGroups = []

        // Process officerships
        for (const officership of userInfo.officerships) {
          // Skip past officerships
          if (officership.till_date !== null) {
            continue
          }

          // Ignore historical teams
          if (officership.officer.status !== 'c') {
            continue
          }

          // Check if that group exists
          const group = await WIKI.models.groups.query().findOne({
            name: 'MyRadio/Teams/' + officership.officer.team.name
          })
          if (group) {
            myradioGroups.push(group)
          }
        }

        // If the Members or Officers groups exist, add those too
        const membersGroup = await WIKI.models.groups.query().findOne({
          name: 'MyRadio/Members'
        })
        if (membersGroup) {
          myradioGroups.push(membersGroup)
        }

        if (userInfo.officerships.filter(x => x.till_date === null).length > 0) {
          const officersGroup = await WIKI.models.groups.query().findOne({
            name: 'MyRadio/Officers'
          })
          if (officersGroup) {
            myradioGroups.push(officersGroup)
          }
        }

        if (userInfo.officerships.filter(x => x.till_date === null && x.officer.status !== 'm').length > 0) {
          const committeeGroup = await WIKI.models.groups.query().findOne({
            name: 'MyRadio/Committee'
          })
          if (committeeGroup) {
            myradioGroups.push(committeeGroup)
          }
        }

        // Pull up the list of their current non-MyRadio groups, to avoid removing any
        const externalGroups = (await user.$relatedQuery('groups').where('name', 'not like', 'MyRadio/%')) || []

        const groupsToSet = _.union(_.uniq(myradioGroups), externalGroups)

        await WIKI.models.users.updateUser({
          id: user.id,
          groups: groupsToSet.map(grp => grp.id)
        })

        cb(null, user)
      })
    )
  }
}
